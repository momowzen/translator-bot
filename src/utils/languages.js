const languages = {
  ar: 'Arabic', bg: 'Bulgarian', cs: 'Czech', da: 'Danish', de: 'German',
  el: 'Greek', en: 'English', es: 'Spanish', et: 'Estonian', fi: 'Finnish',
  fr: 'French', he: 'Hebrew', hu: 'Hungarian', id: 'Indonesian', it: 'Italian',
  ja: 'Japanese', ko: 'Korean', lt: 'Lithuanian', lv: 'Latvian', nl: 'Dutch',
  no: 'Norwegian', pl: 'Polish', pt: 'Portuguese', ro: 'Romanian', ru: 'Russian',
  sk: 'Slovak', sl: 'Slovenian', sv: 'Swedish', th: 'Thai', tr: 'Turkish',
  uk: 'Ukrainian', vi: 'Vietnamese', 'zh-CN': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)',
};

function getLanguageName(code) {
  return languages[code] || code;
}

const langToCountry = {
  ar: 'SA', bg: 'BG', cs: 'CZ', da: 'DK', de: 'DE',
  el: 'GR', en: 'GB', es: 'ES', et: 'EE', fi: 'FI',
  fr: 'FR', he: 'IL', hu: 'HU', id: 'ID', it: 'IT',
  ja: 'JP', ko: 'KR', lt: 'LT', lv: 'LV', nl: 'NL',
  no: 'NO', pl: 'PL', pt: 'PT', ro: 'RO', ru: 'RU',
  sk: 'SK', sl: 'SI', sv: 'SE', th: 'TH', tr: 'TR',
  uk: 'UA', vi: 'VN', 'zh-CN': 'CN', 'zh-TW': 'TW',
};

function getFlag(langCode) {
  const cc = langToCountry[langCode];
  if (!cc) return '';
  const a = cc.charCodeAt(0) - 65 + 0x1F1E6;
  const b = cc.charCodeAt(1) - 65 + 0x1F1E6;
  return String.fromCodePoint(a) + String.fromCodePoint(b);
}

module.exports = { languages, getLanguageName, getFlag };
