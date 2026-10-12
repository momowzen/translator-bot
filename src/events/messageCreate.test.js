process.env.DEEPL_API_KEY = 'test-key';

const test = require('node:test');
const assert = require('node:assert');
const { protect, restore } = require('./messageCreate');
const { normalizeSlang } = require('../services/normalizer');
const { createGlossary } = require('../services/glossary');

test('protects mentions, urls and code from slang expansion', () => {
  const store = [];
  const masked = protect('hi <@123> see https://gg.com and `gg` gg', store);

  assert.strictEqual(masked.includes('<@123>'), false);
  assert.strictEqual(masked.includes('https://gg.com'), false);
  assert.strictEqual(masked.includes('`gg`'), false);

  const expanded = normalizeSlang(masked);
  assert.strictEqual(expanded.includes('good game'), true);

  const restored = restore(expanded, store);
  assert.strictEqual(restored.includes('<@123>'), true);
  assert.strictEqual(restored.includes('https://gg.com'), true);
  assert.strictEqual(restored.includes('`gg`'), true);
  assert.strictEqual(restored.endsWith('good game'), true);
});

test('mention at index 8 survives slang normalization', () => {
  const store = [];
  const content = Array.from({ length: 9 }, (_, i) => `<@${i}>`).join(' ') + ' gg';
  const masked = protect(content, store);

  assert.strictEqual(masked.includes('⟪8⟫'), true);

  const restored = restore(normalizeSlang(masked), store);
  assert.strictEqual(restored, content.replace(' gg', ' good game'));
});

test('glossary masks terms and resolves them per target language', () => {
  const { maskTerms, resolveTerm } = createGlossary({
    keep: ['Ainz'],
    replace: { '다이아': { en: 'diamonds', ja: 'ダイヤ' } },
  });

  const store = [];
  const masked = maskTerms('Ainz bought 다이아 today', store);

  assert.strictEqual(store.length, 2);
  assert.strictEqual(masked.includes('Ainz'), false);
  assert.strictEqual(masked.includes('다이아'), false);

  assert.strictEqual(resolveTerm('Ainz', 'Ainz', 'en'), 'Ainz');
  assert.strictEqual(resolveTerm('다이아', '다이아', 'en'), 'diamonds');
  assert.strictEqual(resolveTerm('다이아', '다이아', 'ja'), 'ダイヤ');
  assert.strictEqual(resolveTerm('다이아', '다이아', 'fr'), '다이아');
});

test('glossary catches Korean terms with attached particles', () => {
  const { maskTerms } = createGlossary({ keep: ['다이아'] });
  const store = [];
  maskTerms('다이아가 많아요', store);
  assert.strictEqual(store.length, 1);
  assert.strictEqual(store[0].term, '다이아');
});

test('glossary uses word boundaries for latin terms', () => {
  const { maskTerms } = createGlossary({ keep: ['GG'] });
  const store = [];
  maskTerms('AGGG GG', store);
  assert.strictEqual(store.length, 1);
});
