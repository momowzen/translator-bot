const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { tmpdir } = require('os');
const { join } = require('path');
const { writeFile, unlink } = require('fs/promises');
const { randomUUID } = require('crypto');
const OpusScript = require('opusscript');
const { transcribe } = require('./stt');
const { speak: ttsSpeak } = require('./tts');
const { translateText } = require('./translator');

const execFileAsync = promisify(execFile);

const LANG_NAME_TO_CODE = {
  english: 'en', korean: 'ko', chinese: 'zh-CN', japanese: 'ja',
  spanish: 'es', french: 'fr', german: 'de', portuguese: 'pt',
  russian: 'ru', arabic: 'ar', hindi: 'hi', italian: 'it',
  dutch: 'nl', swedish: 'sv', polish: 'pl', turkish: 'tr',
  vietnamese: 'vi', thai: 'th', indonesian: 'id', malay: 'ms',
};

class VoiceManager {
  constructor(client) {
    this.client = client;
    this.connections = new Map();
    this.settings = new Map();
    this.userBuffers = new Map();
  }

  getSettings(guildId) {
    return this.settings.get(guildId) || null;
  }

  setSettings(guildId, data) {
    this.settings.set(guildId, data);
  }

  async join(settings) {
    const { guildId, channelId, lang1, lang2 } = settings;
    if (this.connections.has(guildId)) this.disconnect(guildId);

    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isVoiceBased()) throw new Error('Not a voice channel');

    const audioPlayer = createAudioPlayer();

    audioPlayer.on('error', e => console.error('[VOICE] Player error:', e.message));
    audioPlayer.on(AudioPlayerStatus.Idle, async () => {
      if (state.pendingCleanup) {
        for (const f of state.pendingCleanup) await unlink(f).catch(() => {});
        state.pendingCleanup = null;
      }
      state.isSpeaking = false;
      if (state.speakQueue.length) {
        this._playNext(guildId);
      } else {
        state.idleTimer = setTimeout(() => this.disconnect(guildId), 300000);
      }
    });

    const connection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        this.disconnect(guildId);
      }
    });

    connection.subscribe(audioPlayer);

    const state = {
      connection,
      audioPlayer,
      speakQueue: [],
      isSpeaking: false,
      idleTimer: null,
      pendingCleanup: null,
      settings: { guildId, channelId, lang1, lang2 },
      userStreams: new Map(),
    };
    this.connections.set(guildId, state);
    this.settings.set(guildId, settings);

    this._startListening(state);
    return state;
  }

  disconnect(guildId) {
    const state = this.connections.get(guildId);
    if (!state) return;
    if (state.idleTimer) clearTimeout(state.idleTimer);
    for (const [, stream] of state.userStreams) {
      if (!stream.destroyed) stream.destroy();
    }
    state.connection.destroy();
    this.connections.delete(guildId);
    this.settings.delete(guildId);
  }

  _startListening(state) {
    const receiver = state.connection.receiver;
    receiver.speaking.on('start', (userId) => {
      this._onSpeakingStart(state, userId);
    });
    receiver.speaking.on('end', (userId) => {
      this._onSpeakingEnd(state, userId);
    });
  }

  _onSpeakingStart(state, userId) {
    const stream = state.connection.receiver.subscribe(userId, { end: 'manual' });
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    state.userStreams.set(userId, { stream, chunks });
  }

  async _onSpeakingEnd(state, userId) {
    const entry = state.userStreams.get(userId);
    if (!entry) return;
    state.userStreams.delete(userId);
    if (!entry.stream.destroyed) entry.stream.destroy();

    const opusFrames = entry.chunks;
    if (opusFrames.length < 2) {
      console.log(`[VOICE] Skipping ${userId}: only ${opusFrames.length} frames`);
      return;
    }

    try {
      const pcmBuffer = this._decodeOpus(opusFrames);
      if (pcmBuffer.length < 4800) {
        console.log(`[VOICE] Skipping ${userId}: PCM too short (${pcmBuffer.length} bytes)`);
        return;
      }
      const wavBuffer = this._pcmToWav(pcmBuffer);
      const sttResult = await transcribe(wavBuffer);
      if (!sttResult.text || sttResult.text.trim().length < 2) {
        console.log(`[VOICE] Skipping ${userId}: STT empty (text="${sttResult.text}")`);
        return;
      }

      const detected = LANG_NAME_TO_CODE[sttResult.language?.toLowerCase()] || sttResult.language;
      const { lang1, lang2 } = state.settings;
      console.log(`[VOICE] STT: "${sttResult.text}" lang=${detected} | expected: ${lang1}/${lang2}`);
      if (!detected || (detected !== lang1 && detected !== lang2)) {
        console.log(`[VOICE] Skipping ${userId}: lang mismatch (detected=${detected})`);
        return;
      }

      const targetLang = detected === lang1 ? lang2 : lang1;
      const translated = await translateText(sttResult.text, targetLang, detected, state.settings.guildId);
      console.log(`[VOICE] Translated: "${translated.text}"`);
      if (!translated.text || translated.text === sttResult.text) {
        console.log(`[VOICE] Skipping ${userId}: no translation change`);
        return;
      }

      const ttsLang = targetLang === 'ko' ? 'ko' : 'en';
      const audioBuffer = await ttsSpeak(translated.text, ttsLang);
      console.log(`[VOICE] Playing TTS: ${audioBuffer.length} bytes`);
      this._speak(state, audioBuffer);
    } catch (e) {
      console.error('[VOICE] Processing error:', e.message);
    }
  }

  _speak(state, audioBuffer) {
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }
    if (state.isSpeaking || state.audioPlayer.state.status !== AudioPlayerStatus.Idle) {
      state.speakQueue.push(audioBuffer);
      return;
    }
    state.isSpeaking = true;
    this._playAudio(state, audioBuffer);
  }

  async _playNext(guildId) {
    const state = this.connections.get(guildId);
    if (!state || !state.speakQueue.length) return;
    const next = state.speakQueue.shift();
    state.isSpeaking = true;
    this._playAudio(state, next);
  }

  async _playAudio(state, mp3Buffer) {
    const id = randomUUID();
    const mp3Path = join(tmpdir(), `tts-${id}.mp3`);
    const oggPath = join(tmpdir(), `tts-${id}.ogg`);
    try {
      await writeFile(mp3Path, mp3Buffer);
      await execFileAsync('ffmpeg', [
        '-y', '-i', mp3Path,
        '-c:a', 'libopus', '-b:a', '128k', '-vbr', 'on',
        '-application', 'voip',
        oggPath,
      ], { timeout: 15000 });
      await unlink(mp3Path).catch(() => {});
      state.pendingCleanup = [oggPath];
      state.audioPlayer.play(createAudioResource(oggPath));
    } catch (e) {
      console.error('[VOICE] Audio conversion/playback error:', e.message);
      state.isSpeaking = false;
      await unlink(mp3Path).catch(() => {});
      await unlink(oggPath).catch(() => {});
    }
  }

  _decodeOpus(opusFrames) {
    const decoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);
    const pcmParts = [];
    for (const frame of opusFrames) {
      try {
        pcmParts.push(decoder.decode(frame));
      } catch {}
    }
    decoder.delete();
    return Buffer.concat(pcmParts);
  }

  _pcmToWav(pcm) {
    const channels = 2;
    const sampleRate = 48000;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const dataSize = pcm.length;
    const headerSize = 44;
    const buffer = Buffer.alloc(headerSize + dataSize);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    pcm.copy(buffer, 44);
    return buffer;
  }
}

module.exports = VoiceManager;
