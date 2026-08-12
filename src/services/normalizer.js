const DICT = require('../data/slang.json');

const KEYS = Object.keys(DICT).sort((a, b) => b.length - a.length);
const TOKEN_RE = new RegExp(`\\b(?:${KEYS.map(escapeRegex).join('|')})\\b`, 'gi');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expandCase(expansion, original) {
  if (/^[A-Z]{2,}/.test(original)) return expansion.toUpperCase();
  if (/^[A-Z]/.test(original)) return expansion.charAt(0).toUpperCase() + expansion.slice(1);
  return expansion;
}

function normalizeSlang(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(TOKEN_RE, match => expandCase(DICT[match.toUpperCase()], match));
}

module.exports = { normalizeSlang };