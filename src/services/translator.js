const deepl = require('deepl-node');

const translator = new deepl.Translator(process.env.DEEPL_API_KEY);

const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT_PER_CHANNEL = 15;
const usage = new Map();

function rateLimited(channelId) {
  if (!channelId) return false;
  const now = Date.now();
  const slot = usage.get(channelId);
  if (!slot || now - slot.windowStart >= RATE_WINDOW_MS) {
    usage.set(channelId, { count: 1, warned: false, windowStart: now });
    return false;
  }
  slot.count += 1;
  if (slot.count > RATE_LIMIT_PER_CHANNEL) {
    if (!slot.warned) {
      slot.warned = true;
      console.warn(`DeepL rate limit reached for channel ${channelId}, dropping translations until window resets`);
    }
    return true;
  }
  return false;
}

const CODE_MAP = {
  en: 'en-US',
  pt: 'pt-PT',
  'zh-CN': 'zh',
  'zh-TW': 'zh',
  no: 'nb',
};

const REV_MAP = {
  'en-us': 'en', 'en-gb': 'en',
  'pt-pt': 'pt', 'pt-br': 'pt',
  zh: 'zh-CN',
  nb: 'no',
};

const SOURCE_MAP = {
  en: 'en',
  pt: 'pt',
  'zh-CN': 'zh',
  'zh-TW': 'zh',
  no: 'nb',
};

function toTarget(code) {
  return (CODE_MAP[code] || code).toUpperCase();
}

function toSource(code) {
  const lower = code.toLowerCase();
  return (SOURCE_MAP[code] || SOURCE_MAP[lower] || lower).toUpperCase();
}

async function translateText(text, targetLang, sourceLang, channelId) {
  if (rateLimited(channelId)) return { text: null, detectedLang: null };

  const detected = sourceLang === 'auto' ? null : (sourceLang || null);
  const target = toTarget(targetLang);
  const src = sourceLang && sourceLang !== 'auto' ? toSource(sourceLang) : null;

  const run = async (source) => {
    const result = await translator.translateText(text, source, target);
    return {
      text: result.text,
      detectedLang: detected || result.detectedSourceLang?.toLowerCase() || null,
    };
  };

  try {
    return await run(src);
  } catch (err) {
    if (src) {
      try {
        console.warn(`Translation source "${src}" rejected, retrying with auto-detect:`, err.message);
        return await run(null);
      } catch (retryErr) {
        console.error('Translation error:', retryErr.message);
        return { text: null, detectedLang: null };
      }
    }
    console.error('Translation error:', err.message);
    return { text: null, detectedLang: null };
  }
}

async function detectLanguage(text, channelId) {
  try {
    if (rateLimited(channelId)) return null;
    const result = await translator.translateText(text, null, 'EN-US');
    const raw = result.detectedSourceLang?.toLowerCase() || null;
    return REV_MAP[raw] || raw;
  } catch (err) {
    console.error('Detection error:', err.message);
    return null;
  }
}

module.exports = { translateText, detectLanguage, toSource, toTarget };