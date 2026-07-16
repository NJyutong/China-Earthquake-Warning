'use strict';

const OpenCC = require('opencc-js');

const convertTaiwanText = OpenCC.Converter({ from: 'tw', to: 'cn' });
const MAX_DEPTH = 32;
const MAX_NODES = 20000;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function simplifyTaiwanText(value) {
  const source = String(value == null ? '' : value);
  if (!source) return source;
  try {
    return convertTaiwanText(source);
  } catch (_error) {
    return source.replace(/臺/g, '台');
  }
}

function simplifyTaiwanPayload(value) {
  const seen = new WeakMap();
  const state = { nodes: 0 };
  return visit(value, 0, seen, state);
}

function visit(value, depth, seen, state) {
  state.nodes += 1;
  if (state.nodes > MAX_NODES || depth > MAX_DEPTH) return value;
  if (typeof value === 'string') return simplifyTaiwanText(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const output = [];
    seen.set(value, output);
    for (const item of value) output.push(visit(item, depth + 1, seen, state));
    return output;
  }

  const output = {};
  seen.set(value, output);
  for (const [key, item] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) continue;
    output[key] = visit(item, depth + 1, seen, state);
  }
  return output;
}

module.exports = { simplifyTaiwanText, simplifyTaiwanPayload };
