const DEFAULTS = require('./terms.json');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatcher(terms) {
  const list = Array.from(new Set(terms.filter(t => typeof t === 'string' && t.trim())));
  if (list.length === 0) return null;

  const parts = [];
  for (const term of list) {
    const escaped = escapeRegex(term);
    if (/^[\x00-\x7F]+$/.test(term)) {
      parts.push(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`);
    } else {
      parts.push(escaped);
    }
  }
  return new RegExp(parts.join('|'), 'gu');
}

function createGlossary(config = {}) {
  const keep = Array.isArray(config.keep) ? config.keep : [];
  const replace = config.replace && typeof config.replace === 'object' ? config.replace : {};
  const matcher = buildMatcher([...keep, ...Object.keys(replace)]);

  function maskTerms(text, store) {
    if (!matcher) return text;
    return text.replace(matcher, match => {
      store.push({ text: match, term: match });
      return `⟪${store.length - 1}⟫`;
    });
  }

  function resolveTerm(term, fallback, targetLang) {
    const map = replace[term];
    if (map && targetLang && typeof map[targetLang] === 'string') return map[targetLang];
    return fallback;
  }

  return { maskTerms, resolveTerm };
}

const glossary = createGlossary(DEFAULTS);

module.exports = {
  createGlossary,
  maskTerms: glossary.maskTerms,
  resolveTerm: glossary.resolveTerm,
};
