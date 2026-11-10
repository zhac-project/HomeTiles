import {isDeepStrictEqual} from 'node:util';
import {parse} from 'acorn';
import {minify} from 'terser';

function isOrdinaryShorthandProperty(node, parent) {
  return parent?.type === 'ObjectExpression' && node.type === 'Property' &&
    node.kind === 'init' && node.computed === false && node.method === false &&
    node.key.type === 'Identifier' && node.value.type === 'Identifier' &&
    node.key.name === node.value.name && node.key.name !== '__proto__';
}

function comparableAst(value, parent = null) {
  if (Array.isArray(value)) return value.map(item => comparableAst(item, parent));
  if (!value || typeof value !== 'object' || value instanceof RegExp) return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    // Literal.raw is a lexical spelling. TemplateElement.value.raw is observable
    // by tagged templates and must remain part of the comparison.
    if (value.type && ['start', 'end', 'loc', 'raw'].includes(key)) continue;
    result[key] = comparableAst(child, value);
  }
  // The printer may choose {name} or {name: name}. Only ordinary matching
  // identifier properties qualify; prototype setters and patterns do not.
  if (isOrdinaryShorthandProperty(value, parent)) result.shorthand = false;
  return result;
}

export function assertAdminDeliveryEquivalent(source, delivery) {
  const options = {ecmaVersion: 'latest', sourceType: 'script'};
  const sourceAst = comparableAst(parse(source, options));
  const deliveryAst = comparableAst(parse(delivery, options));
  if (!isDeepStrictEqual(sourceAst, deliveryAst)) {
    throw new Error('Admin delivery AST changed beyond lexical formatting or ordinary data-property shorthand.');
  }
}

// This runs only on the host. Keep readable source units and the assembled
// admin.js intact; the firmware stores only the formatted delivery gzip.
export async function formatAdminDelivery(source) {
  const result = await minify(source, {
    compress: false,
    mangle: false,
    module: false,
    format: {comments: 'some', ecma: 2020},
  });
  if (typeof result.code !== 'string') throw new Error('Admin delivery formatter produced no JavaScript.');
  assertAdminDeliveryEquivalent(source, result.code);
  return result.code;
}

// The source without its comments (outside strings). A comment between two
// non-space characters would join their tokens: refused, never guessed.
function stripCssComments(source) {
  let out = '';
  let quote = '';
  for (let i = 0; i < source.length; ++i) {
    const ch = source[i];
    if (quote) {
      out += ch;
      if (ch === '\\') out += source[++i] ?? '';
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch !== '/' || source[i + 1] !== '*') {
      out += ch;
      continue;
    }
    const end = source.indexOf('*/', i + 2);
    if (end < 0) throw new Error('Admin CSS has an unterminated comment.');
    const before = out.at(-1) ?? ' ';
    const after = source[end + 2] ?? ' ';
    if (!/\s/.test(before) && !/\s/.test(after)) {
      throw new Error('Admin CSS comment joins two tokens: ' + source.slice(Math.max(0, i - 20), end + 22));
    }
    i = end + 1;
  }
  if (quote) throw new Error('Admin CSS has an unterminated string.');
  return out;
}

// The firmware stores the delivered CSS: without comments, blank lines and
// indentation (the readable source keeps them). Only whitespace and comments
// change, which the check below proves.
export function formatCssDelivery(source) {
  const stripped = stripCssComments(source);
  const delivery = stripped.split('\n').map(line => line.trim()).filter(Boolean).join('\n') + '\n';
  const spaced = text => text.replace(/\s+/g, ' ').trim();
  if (spaced(stripped) !== spaced(delivery)) {
    throw new Error('Admin CSS delivery changed beyond comments and whitespace.');
  }
  return delivery;
}
