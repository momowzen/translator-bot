const { translateText, detectLanguage } = require('../services/translator');
const { normalizeSlang } = require('../services/normalizer');
const { getFlag } = require('../utils/languages');

const PROTECT_RE = /```[\s\S]*?```|`[^`\n]*`|https?:\/\/[^\s<>()]+|<[@#][!&]?\d+>|<a?:\w+:\d+>|@(?:everyone|here)/g;

const DEDUP_WINDOW_MS = 4000;
const lastTranslated = new Map();

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

function protect(text, store) {
  return text.replace(PROTECT_RE, m => {
    store.push(m);
    return `⟪${store.length - 1}⟫`;
  });
}

function restoreMentions(text, store) {
  return text.replace(/⟪(\d+)⟫/g, (_, i) => store[+i] || '');
}

module.exports = {
  name: 'messageCreate',
  protect,
  restoreMentions,
  async execute(message, client) {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;

      // Auto-translate
      const channelSetting = await client.db.getChannelSetting(message.channelId);
      if (!channelSetting?.auto_translate_lang) return;

      const segments = [];
      const textToTranslate = normalizeSlang(protect(message.content, segments));
      if (!textToTranslate) return;

      const langs = channelSetting.auto_translate_lang;

      const detected = await detectLanguage(textToTranslate, message.channelId);
      if (!detected) return;
      if (isDuplicateText(message.channelId, textToTranslate)) return;

      if (langs.length === 1 && detected !== langs[0]) {
        const result = await translateText(textToTranslate, langs[0], 'auto', message.channelId);
        if (result.text && result.text !== textToTranslate) {
          const translated = restoreMentions(result.text, segments);
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
          const result = await translateText(textToTranslate, targetLang, 'auto', message.channelId);
          if (result.text && result.text !== textToTranslate) {
            parts.push([getFlag(targetLang), restoreMentions(result.text, segments)].filter(Boolean).join('\n'));
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
