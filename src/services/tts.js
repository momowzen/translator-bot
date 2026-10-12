const { execFile } = require('child_process');
const { promisify } = require('util');
const { tmpdir } = require('os');
const { join } = require('path');
const { readFile, unlink } = require('fs/promises');
const { randomUUID } = require('crypto');

const execFileAsync = promisify(execFile);

const VOICES = {
  en: 'en-US-AvaNeural',
  ko: 'ko-KR-SunHiNeural',
  ja: 'ja-JP-NanamiNeural',
  'zh-CN': 'zh-CN-XiaoxiaoNeural',
  'zh-TW': 'zh-TW-HsiaoChenNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  es: 'es-ES-ElviraNeural',
  pt: 'pt-BR-FranciscaNeural',
  ru: 'ru-RU-SvetlanaNeural',
  it: 'it-IT-ElsaNeural',
  ar: 'ar-SA-ZariyahNeural',
  hi: 'hi-IN-SwaraNeural',
  th: 'th-TH-PremwadeeNeural',
  vi: 'vi-VN-HoaiMyNeural',
  tr: 'tr-TR-EmelNeural',
  pl: 'pl-PL-AgnieszkaNeural',
  nl: 'nl-NL-ColetteNeural',
  sv: 'sv-SE-SofieNeural',
  da: 'da-DK-ChristelNeural',
  fi: 'fi-FI-SelmaNeural',
  no: 'nb-NO-PernilleNeural',
  uk: 'uk-UA-PolinaNeural',
  cs: 'cs-CZ-VlastaNeural',
  ro: 'ro-RO-AlinaNeural',
  hu: 'hu-HU-NoemiNeural',
  el: 'el-GR-AthinaNeural',
  bg: 'bg-BG-KalinaNeural',
  hr: 'hr-HR-GabrijelaNeural',
  sk: 'sk-SK-LindaNeural',
  sl: 'sl-SI-PetraNeural',
  et: 'et-EE-AnuNeural',
  lv: 'lv-LV-EveritaNeural',
  lt: 'lt-LT-OnaNeural',
  id: 'id-ID-GadisNeural',
  ms: 'ms-MY-YasminNeural',
  tl: 'fil-PH-BlessicaNeural',
  ta: 'ta-IN-PallaviNeural',
  te: 'te-IN-ShrutiNeural',
  bn: 'bn-BD-TanishaaNeural',
  mr: 'mr-IN-AarohiNeural',
  gu: 'gu-IN-DhwaniNeural',
  kn: 'kn-IN-SapnaNeural',
  ml: 'ml-IN-SobhanaNeural',
  pa: 'pa-IN-GurpreetNeural',
  ur: 'ur-PK-UzmaNeural',
  si: 'si-LK-ThiliniNeural',
  km: 'km-KH-SreymomNeural',
  lo: 'lo-LA-KeomanyNeural',
  my: 'my-MM-HninNeural',
  ka: 'ka-GE-EkaNeural',
  am: 'am-ET-MekdesNeural',
  sw: 'sw-KE-ZuriNeural',
  af: 'af-ZA-AdriNeural',
  sq: 'sq-AL-AnilaNeural',
  hy: 'hy-AM-AnahitNeural',
  az: 'az-AZ-BanuNeural',
  eu: 'eu-ES-AinhoaNeural',
  be: 'be-BY-HannaNeural',
  bs: 'bs-BA-VesnaNeural',
  ca: 'ca-ES-JoanaNeural',
  cy: 'cy-GB-NiaNeural',
  fa: 'fa-IR-DilaraNeural',
  ga: 'ga-IE-OrlaNeural',
  gl: 'gl-ES-RoiNeural',
  he: 'he-IL-HilaNeural',
  is: 'is-IS-GudrunNeural',
  mk: 'mk-MK-MarijaNeural',
  mt: 'mt-MT-GraceNeural',
  mn: 'mn-MN-YesuiNeural',
  ne: 'ne-NP-HemkalaNeural',
  ps: 'ps-AF-LatifaNeural',
  sr: 'sr-RS-SophieNeural',
  so: 'so-SO-UbaxNeural',
  zu: 'zu-ZA-ThandoNeural',
  ha: 'ha-NG-AminaNeural',
};

const MAX_ATTEMPTS = 3;

function synthArgs(text, voice, tmpFile) {
  const args = ['--text', text, '--voice', voice, '--write-media', tmpFile];
  if (process.env.EDGE_TTS_PROXY) args.push('--proxy', process.env.EDGE_TTS_PROXY);
  return args;
}

async function speak(text, lang) {
  const voice = VOICES[lang] || VOICES.en;
  const tmpFile = join(tmpdir(), `tts-${randomUUID()}.mp3`);
  let lastErr;
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await execFileAsync('edge-tts', synthArgs(text, voice, tmpFile), { timeout: 20000 });
        return await readFile(tmpFile);
      } catch (err) {
        lastErr = err;
        await unlink(tmpFile).catch(() => {});
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    throw lastErr;
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

module.exports = { speak, VOICES };
