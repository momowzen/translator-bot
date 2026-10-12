const { translateText, detectLanguage } = require('../services/translator');
const { normalizeSlang } = require('../services/normalizer');
const { maskTerms, resolveTerm } = require('../services/glossary');
const { getFlag } = require('../utils/languages');

const PROTECT_RE = /```[\s\S]*?```|`[^`\n]*`|https?:\/\/[^\s<>()]+|<[@#][!&]?\d+>|<a?:\w+:\d+>|@(?:everyone|here)/g;

const DEDUP_WINDOW_MS = 4000;
const CONTEXT_MESSAGES = Math.max(0, Number.parseInt(process.env.TRANSLATOR_CONTEXT_MESSAGES ?? '3', 10) || 0);
const CONTEXT_MAX_CHARS = 1000;

const lastTranslated = new Map();
const recentMessages = new Map();

function isDuplicateText(channelId, text) {
  const key = `${channelId}\u0000${text}`;
  const now = Date.now();
  const prev = lastTranslated.get(key);
  if (prev && now - prev < DEDUP_WINDOW_MS) return true;
  lastTranslated.set(key, now);
  if (lastTranslated.size > 5000) {
    for (const [k, ts] of lastTranslated) {
      if (now - ts >= DEDUP_WINDOW_MS) lastTranslated.delete(k);
    }
  }
  return false;
}

function getContext(channelId) {
  if (!CONTEXT_MESSAGES) return undefined;
  const recent = recentMessages.get(channelId);
  if (!recent?.length) return undefined;
  return recent.join('\n').slice(-CONTEXT_MAX_CHARS);
}

function remember(channelId, text) {
  if (!CONTEXT_MESSAGES) return;
  let recent = recentMessages.get(channelId);
  if (!recent) {
    recent = [];
    recentMessages.set(channelId, recent);
  }
  recent.push(text);
  if (recent.length > CONTEXT_MESSAGES) recent.splice(0, recent.length - CONTEXT_MESSAGES);
  if (recentMessages.size > 2000) {
    recentMessages.delete(recentMessages.keys().next().value);
  }
}

function protect(text, store) {
  return text.replace(PROTECT_RE, m => {
    store.push({ text: m });
    return `⟪${store.length - 1}⟫`;
  });
}

function restore(text, store, targetLang) {
  return text.replace(/⟪(\d+)⟫/g, (_, i) => {
    const entry = store[+i];
    if (!entry) return '';
    return entry.term ? resolveTerm(entry.term, entry.text, targetLang) : entry.text;
  });
}

module.exports = {
  name: 'messageCreate',
  protect,
  restore,
  async execute(message, client) {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;

      // Auto-translate
      const channelSetting = await client.db.getChannelSetting(message.channelId);
      if (!channelSetting?.auto_translate_lang) return;

      const segments = [];
      const textToTranslate = normalizeSlang(maskTerms(protect(message.content, segments), segments));
      if (!textToTranslate) return;

      const langs = channelSetting.auto_translate_lang;
      const context = getContext(message.channelId);
      remember(message.channelId, message.content);

      const detected = await detectLanguage(textToTranslate, message.channelId);
      if (!detected) return;
      if (isDuplicateText(message.channelId, textToTranslate)) return;

      if (langs.length === 1 && detected !== langs[0]) {
        const result = await translateText(textToTranslate, langs[0], 'auto', message.channelId, { context });
        if (result.text && result.text !== textToTranslate) {
          const translated = restore(result.text, segments, langs[0]);
          await message.reply({
            embeds: [{
              color: 0x5865F2,
              description: [getFlag(langs[0]), translated].filter(Boolean).join('\n'),
            }],
            allowedMentions: { parse: [] },
          });
        }
      } else if (langs.length > 1) {
        const parts = [];
        for (const targetLang of langs) {
          if (targetLang === detected) continue;
          const result = await translateText(textToTranslate, targetLang, 'auto', message.channelId, { context });
          if (result.text && result.text !== textToTranslate) {
            parts.push([getFlag(targetLang), restore(result.text, segments, targetLang)].filter(Boolean).join('\n'));
          }
        }
        if (parts.length > 0) {
          await message.reply({
            embeds: [{
              color: 0x5865F2,
              description: parts.join('\n\n'),
            }],
            allowedMentions: { parse: [] },
          });
        }
      }
    } catch (err) {
      console.error('messageCreate error:', err);
    }
  },
};
