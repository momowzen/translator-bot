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
};

async function speak(text, lang) {
  const voice = VOICES[lang] || VOICES.en;
  const tmpFile = join(tmpdir(), `tts-${randomUUID()}.mp3`);
  try {
    await execFileAsync('edge-tts', [
      '--text', text,
      '--voice', voice,
      '--write-media', tmpFile,
    ], { timeout: 20000 });
    return await readFile(tmpFile);
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

module.exports = { speak, VOICES };
