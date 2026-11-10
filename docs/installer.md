# Installation

<div class="ht-install" markdown>

<section class="ht-install-step" markdown>

## Flash the firmware { #browser-installer }

<span id="update-hometiles"></span><span id="first-install-or-factory-reset"></span>

Connect the display by USB to a computer with Chrome or Edge and choose your [exact device](index.md#device-support).

<div class="ht-installer" data-hometiles-installer>
<div class="ht-installer-form">
<div class="ht-installer-section">
<label class="ht-installer-section-heading" for="installer-firmware-source">Firmware</label>
<div class="ht-installer-section-body">
<p class="ht-installer-section-info">Choose the published release or a local HomeTiles .bin file.</p>
<div class="ht-installer-control ht-installer-firmware-control">
<select id="installer-firmware-source" autocomplete="off" disabled>
<option value="published">Loading published release...</option>
<option value="local">Local HomeTiles .bin file</option>
</select>
<input id="installer-firmware-file" class="ht-installer-firmware-file" type="file" accept=".bin,application/octet-stream" hidden>
</div>
</div>
</div>
<div class="ht-installer-section">
<label id="installer-device-label" class="ht-installer-section-heading" for="installer-device">Device</label>
<div class="ht-installer-section-body">
<p class="ht-installer-section-info">Select the exact model printed on the device or rear label.</p>
<div class="ht-installer-control">
<select id="installer-device" autocomplete="off">
<option value="">Loading devices...</option>
</select>
<div id="installer-device-details" class="ht-installer-device-details" data-kind="info" hidden></div>
</div>
</div>
</div>
<div class="ht-installer-section">
<div id="installer-mode-label" class="ht-installer-section-heading">Mode</div>
<div class="ht-installer-section-body">
<p class="ht-installer-section-info">Update keeps settings. First install / factory reset erases all local data.</p>
<div class="ht-installer-modes" role="radiogroup" aria-labelledby="installer-mode-label">
<label class="ht-installer-mode">
<input type="radio" name="installer-mode" value="update" checked>
<strong>Update</strong>
</label>
<label class="ht-installer-mode ht-installer-mode-danger">
<input type="radio" name="installer-mode" value="factory">
<strong>First install / factory reset</strong>
</label>
</div>
</div>
</div>
<div class="ht-installer-section">
<div id="installer-confirm-label" class="ht-installer-section-heading">Check</div>
<div class="ht-installer-section-body">
<p class="ht-installer-section-info">Confirm the exact label before connecting the serial port.</p>
<div class="ht-installer-confirmations">
<label>
<input id="installer-exact-hardware" type="checkbox">
<span id="installer-exact-hardware-text">I checked the exact model label.</span>
</label>
<label id="installer-factory-confirmation-row" class="ht-installer-danger-check" hidden>
<input id="installer-factory-confirmation" type="checkbox">
<span>Erase all settings and local data.</span>
</label>
</div>
</div>
</div>
<div class="ht-installer-section ht-installer-section-connect">
<div class="ht-installer-section-heading">Flash</div>
<div class="ht-installer-section-body ht-installer-action">
<p class="ht-installer-section-info">Keep power, USB and this tab open while flashing.</p>
<div class="ht-installer-action-row">
<button id="installer-flash" type="button" disabled>Connect and flash</button>
<div id="installer-status" class="ht-installer-status" role="status" aria-live="polite" data-kind="info">Loading...</div>
</div>
<p id="installer-serial-busy" class="ht-installer-status" role="status" hidden>Log capture is active. Selecting a port with Connect and flash stops capture and releases its USB port. Cancelling the port selection keeps capture running.</p>
<div id="installer-progress-panel" class="ht-installer-progress" hidden>
<div class="ht-installer-progress-meta">
<strong id="installer-phase">Preparing</strong>
<span id="installer-progress-text">0%</span>
</div>
<progress id="installer-progress" max="100" value="0" aria-labelledby="installer-phase installer-progress-text"></progress>
</div>
</div>
<div id="installer-log-panel" class="ht-installer-log-panel" hidden>
<div class="ht-installer-log-header">
<strong>Flash log</strong>
<button id="installer-copy-log" type="button" aria-label="Copy flash log to clipboard">Copy log</button>
<button id="installer-clear-log" type="button">Clear log</button>
<span id="installer-log-action-status" role="status" aria-live="polite"></span>
</div>
<pre id="installer-log-output" role="log" aria-label="Installer flash log" aria-live="off" tabindex="0"></pre>
</div>
</div>
</div>
</div>

</section>

<section class="ht-install-step" markdown>

## Install the Bridge { #install-the-bridge }

<span id="step-1-install-the-bridge"></span>

Add the [HomeTiles Bridge](https://github.com/GalusPeres/HomeTiles-Bridge) to Home Assistant with the button, select **Download** and restart Home Assistant.

<div class="ht-install-action"><a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=GalusPeres&amp;repository=HomeTiles-Bridge&amp;category=integration"><img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open the HomeTiles Bridge repository in HACS"></a></div>

</section>

<section class="ht-install-step" markdown>

## Set up the display { #set-up-the-display }

<span id="step-2-start-the-display"></span><span id="step-3-pair-with-home-assistant"></span>

The display guides you. At **Pair**, select **Add** in Home Assistant under **Settings → Devices & services** and confirm the same number on both sides.

<div class="ht-install-pair">
<figure><img src="../images/v09-setup-pair.png" alt="The display: Pair this panel" width="800" height="470" loading="lazy"><figcaption>1. On the display: tap <strong>Pair</strong></figcaption></figure>
<figure><img src="../images/ha-v09-discovered.png" alt="Home Assistant: the discovered display with Add" width="415" height="230" loading="lazy"><figcaption>2. In Home Assistant: <strong>Add</strong></figcaption></figure>
<figure><img src="../images/ha-v09-number.png" alt="Home Assistant shows the number 847 170" width="725" height="462" loading="lazy"><figcaption>3. Same number: <strong>Numbers match: connect</strong></figcaption></figure>
<figure><img src="../images/v09-setup-number.png" alt="The display shows the same number 847 170" width="800" height="470" loading="lazy"><figcaption>4. On the display: <strong>Confirm</strong></figcaption></figure>
</div>


</section>

<section class="ht-install-step" markdown>

## Add your tiles { #add-your-tiles }

Open the address the display shows in your computer's browser and build your dashboard in the [Web Admin](web-admin.md).

<div class="ht-install-done"><img src="../images/v09-home.png" alt="A finished HomeTiles dashboard" width="1280" height="800" loading="lazy"></div>

</section>

</div>

<p class="ht-install-more">Manual flashing, no HACS, an MQTT broker or an older display: <a href="../advanced-setup/">Advanced setup</a>. Problems: <a href="../faq/">Troubleshooting</a>.</p>
