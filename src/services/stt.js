const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const GROQ_API = 'https://api.groq.com/openai/v1/audio/transcriptions';

function downsampleWav(wavBuffer) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', 'pipe:0',
      '-ar', '16000',
      '-ac', '1',
      '-f', 'wav',
      'pipe:1',
    ];
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    proc.stdout.on('data', c => chunks.push(c));
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`ffmpeg downsample exit ${code}`));
      resolve(Buffer.concat(chunks));
    });
    proc.on('error', reject);
    proc.stdin.write(wavBuffer);
    proc.stdin.end();
  });
}

async function transcribe(wavBuffer) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const smallWav = await downsampleWav(wavBuffer);

  const boundary = `----FormBoundary${randomUUID()}`;

  const parts = [];
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n` +
    `Content-Type: audio/wav\r\n\r\n`
  ));
  parts.push(smallWav);
  parts.push(Buffer.from('\r\n'));
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n` +
    `whisper-large-v3-turbo\r\n`
  ));
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
    `verbose_json\r\n`
  ));
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const resp = await fetch(GROQ_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Groq STT ${resp.status}: ${errText}`);
  }

  const result = await resp.json();
  return {
    text: result.text || '',
    language: result.language || null,
  };
}

module.exports = { transcribe };
