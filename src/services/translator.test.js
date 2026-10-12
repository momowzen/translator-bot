const test = require('node:test');
const assert = require('node:assert');

const deeplPath = require.resolve('deepl-node');
const calls = [];

class FakeTranslator {
  async translateText(text, source, target, options) {
    calls.push({ text, source, target, options });
    if (source) {
      throw new Error("Bad request. Reason: Value for 'source_lang' not supported.");
    }
    return { text: `${target}:${text}`, detectedSourceLang: 'EN' };
  }
}

require.cache[deeplPath] = {
  id: deeplPath,
  filename: deeplPath,
  loaded: true,
  exports: { Translator: FakeTranslator },
};

const { translateText, toSource, toTarget } = require('./translator');

test('toSource maps internal codes to valid DeepL source languages', () => {
  assert.strictEqual(toSource('en'), 'EN');
  assert.strictEqual(toSource('pt'), 'PT');
  assert.strictEqual(toSource('zh-CN'), 'ZH');
  assert.strictEqual(toSource('zh-TW'), 'ZH');
  assert.strictEqual(toSource('no'), 'NB');
  assert.strictEqual(toSource('haw'), 'HAW');
});

test('toTarget maps internal codes to valid DeepL target languages', () => {
  assert.strictEqual(toTarget('en'), 'EN-US');
  assert.strictEqual(toTarget('pt'), 'PT-PT');
  assert.strictEqual(toTarget('zh-CN'), 'ZH');
  assert.strictEqual(toTarget('no'), 'NB');
});

test('translateText retries with auto-detect when source is rejected', async () => {
  calls.length = 0;
  const result = await translateText('hello', 'ja', 'haw');
  assert.strictEqual(result.text, 'JA:hello');
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].source, 'HAW');
  assert.strictEqual(calls[1].source, null);
});

test('translateText skips the explicit source when auto-detecting', async () => {
  calls.length = 0;
  const result = await translateText('hello', 'ja', 'auto');
  assert.strictEqual(result.text, 'JA:hello');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].source, null);
});

test('translateText forwards DeepL options', async () => {
  calls.length = 0;
  await translateText('hello', 'ja', 'auto', undefined, { context: 'prior message' });
  assert.strictEqual(calls[0].options.modelType, 'quality_optimized');
  assert.strictEqual(calls[0].options.preserveFormatting, true);
  assert.strictEqual(calls[0].options.context, 'prior message');
});

test('translateText honors a per-call modelType override', async () => {
  calls.length = 0;
  await translateText('hello', 'ja', 'auto', undefined, { modelType: 'latency_optimized' });
  assert.strictEqual(calls[0].options.modelType, 'latency_optimized');
  assert.strictEqual(calls[0].options.context, undefined);
});
