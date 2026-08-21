const { Readable } = require('stream');
const { tmpdir } = require('os');
const { join } = require('path');
const { writeFile, readFile, unlink } = require('fs/promises');
const { randomUUID } = require('crypto');

const GROQ_API = 'https://api.groq.com/openai/v1/audio/transcriptions';

async function transcribe(wavBuffer) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const boundary = `----FormBoundary${randomUUID()}`;
  const tmpFile = join(tmpdir(), `stt-${randomUUID()}.wav`);

  await writeFile(tmpFile, wavBuffer);

  try {
    const fileData = await readFile(tmpFile);

    const parts = [];
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"\r\n` +
      `Content-Type: audio/wav\r\n\r\n`
    ));
    parts.push(fileData);
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
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

module.exports = { transcribe };
