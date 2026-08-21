const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const { Readable } = require('stream');
const opus = require('@discordjs/opus');
const { transcribe } = require('./stt');
const { speak: ttsSpeak } = require('./tts');
const { translateText } = require('./translator');

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
    const speakQueue = [];
    let isSpeaking = false;
    let idleTimer = null;

    audioPlayer.on('error', e => console.error('[VOICE] Player error:', e.message));
    audioPlayer.on(AudioPlayerStatus.Idle, () => {
      isSpeaking = false;
      if (speakQueue.length) {
        this._playNext(guildId);
      } else {
        idleTimer = setTimeout(() => this.disconnect(guildId), 300000);
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
      speakQueue,
      isSpeaking,
      idleTimer,
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
    if (opusFrames.length < 2) return;

    try {
      const pcmBuffer = this._decodeOpus(opusFrames);
      if (pcmBuffer.length < 4800) return;
      const wavBuffer = this._pcmToWav(pcmBuffer);
      const sttResult = await transcribe(wavBuffer);
      if (!sttResult.text || sttResult.text.trim().length < 2) return;

      const detected = sttResult.language;
      const { lang1, lang2 } = state.settings;
      if (!detected || (detected !== lang1 && detected !== lang2)) return;

      const targetLang = detected === lang1 ? lang2 : lang1;
      const translated = await translateText(sttResult.text, targetLang, detected, state.settings.guildId);
      if (!translated.text || translated.text === sttResult.text) return;

      const ttsLang = targetLang === 'ko' ? 'ko' : 'en';
      const audioBuffer = await ttsSpeak(translated.text, ttsLang);
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
    state.audioPlayer.play(createAudioResource(Readable.from(audioBuffer)));
  }

  async _playNext(guildId) {
    const state = this.connections.get(guildId);
    if (!state || !state.speakQueue.length) return;
    const next = state.speakQueue.shift();
    state.isSpeaking = true;
    state.audioPlayer.play(createAudioResource(Readable.from(next)));
  }

  _decodeOpus(opusFrames) {
    const decoder = new opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
    const pcmParts = [];
    for (const frame of opusFrames) {
      try {
        pcmParts.push(decoder.decode(frame));
      } catch {}
    }
    decoder.destroy();
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
