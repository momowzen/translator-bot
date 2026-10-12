process.env.DEEPL_API_KEY = 'test-key';

const test = require('node:test');
const assert = require('node:assert');
const { protect, restoreMentions } = require('./messageCreate');
const { normalizeSlang } = require('../services/normalizer');

test('protects mentions, urls and code from slang expansion', () => {
  const store = [];
  const masked = protect('hi <@123> see https://gg.com and `gg` gg', store);

  assert.strictEqual(masked.includes('<@123>'), false);
  assert.strictEqual(masked.includes('https://gg.com'), false);
  assert.strictEqual(masked.includes('`gg`'), false);

  const expanded = normalizeSlang(masked);
  assert.strictEqual(expanded.includes('good game'), true);

  const restored = restoreMentions(expanded, store);
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

  const restored = restoreMentions(normalizeSlang(masked), store);
  assert.strictEqual(restored, content.replace(' gg', ' good game'));
});
