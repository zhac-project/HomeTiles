// Drive a disposable headless browser against the real, locally built docs.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export async function startDocsBrowser(executable, directory) {
  const args = ["--headless=new", "--disable-gpu", "--disable-extensions", "--no-first-run",
    "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0",
    `--user-data-dir=${directory}`, "--window-size=1280,960", "about:blank"];
  if (process.getuid?.() === 0) args.unshift("--no-sandbox");
  const child = spawn(executable, args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  // The browser's own last messages go into a failure (a page it never loads).
  let browserLog = "";
  child.stderr.on("data", chunk => { browserLog = (browserLog + chunk).slice(-4000); });
  let socket;
  try {
    let port;
    for (let attempt = 0; attempt < 200 && !port; attempt++) {
      try { port = (await fs.readFile(path.join(directory, "DevToolsActivePort"), "utf8")).split("\n")[0]; }
      catch { await delay(25); }
    }
    assert.ok(port, "Headless Chrome did not expose its test endpoint");
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    const errors = [];
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
      const callback = pending.get(message.id);
      if (!callback) return;
      pending.delete(message.id);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
      else callback.resolve(message.result);
    });
    // A call the browser never answers (a hung or crashed renderer) fails the
    // test with its name instead of holding the CI job until it is cancelled.
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Browser call ${method} got no answer in 30 s\n${browserLog}`));
      }, 30000);
      pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
    await send("Page.enable");
    await send("Runtime.enable");
    const evaluate = async expression => {
      const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      assert.ok(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
      return response.result.value;
    };
    return {
      send, evaluate, errors,
      async until(expression, label, timeout = 10000) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          if (await evaluate(expression)) return;
          await delay(30);
        }
        throw new Error(`${label}: ${await evaluate("JSON.stringify({header: document.querySelector('.ht-serial-status')?.textContent, installer: window.installerRoot?.querySelector('#installer-status')?.textContent, events: window.fixture?.events, search: document.querySelector('[data-md-component=search]')?.innerText})")}\n${await evaluate("document.body.innerText.slice(-1200)")}`);
      },
      async close() {
        socket.close();
        // A browser that already exited sends no second exit event.
        if (child.exitCode !== null || child.signalCode !== null) return;
        const exited = new Promise(resolve => child.once("exit", resolve));
        child.kill();
        const forced = setTimeout(() => child.kill("SIGKILL"), 5000);
        await exited;
        clearTimeout(forced);
      },
    };
  } catch (error) {
    socket?.close();
    child.kill();
    throw error;
  }
}
