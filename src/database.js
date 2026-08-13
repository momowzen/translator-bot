const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;

const MAX_CACHE_SIZE = 1000;
const channelCache = new Map();

function cacheChannelSetting(channelId, setting) {
  if (channelCache.size >= MAX_CACHE_SIZE) {
    channelCache.delete(channelCache.keys().next().value);
  }
  channelCache.set(channelId, setting);
}

function invalidateChannelSetting(channelId) {
  channelCache.delete(channelId);
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { channels: {} };
  }
}

function save(data) {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data));
}

async function turso(sql, args = []) {
  if (!TURSO_URL || !TURSO_TOKEN) {
    throw new Error('Turso is not configured');
  }
  let res;
  try {
    res = await fetch(`${TURSO_URL}/v2/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TURSO_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql, args } },
          { type: 'close' },
        ],
      }),
    });
  } catch (err) {
    throw new Error(`Turso request failed: ${err.message}`);
  }
  if (!res.ok) {
    throw new Error(`Turso HTTP ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const result = json.results?.[0];
  if (json.error || result?.error) {
    throw new Error(result?.error?.message || json.error?.message || 'Turso request error');
  }
  return result;
}

let tablesReady = null;
function ensureTables() {
  if (!TURSO_URL) return Promise.resolve();
  if (!tablesReady) {
    tablesReady = (async () => {
      await turso(
        'CREATE TABLE IF NOT EXISTS channel_settings (channel_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, auto_translate_lang TEXT)'
      );
    })().catch(err => {
      tablesReady = null;
      throw err;
    });
  }
  return tablesReady;
}

function parseRows(res) {
  const rows = res?.response?.result?.rows;
  if (!Array.isArray(rows)) return [];
  return rows.map(row => Array.from(row));
}

function parseLangList(value) {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  const trimmed = String(value).trim();
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr;
      return [trimmed];
    } catch {
      return [trimmed];
    }
  }
  return trimmed.includes(',') ? trimmed.split(',').map(s => s.trim()).filter(Boolean) : [trimmed];
}

module.exports = {
  async getChannelSetting(channelId) {
    if (channelCache.has(channelId)) return channelCache.get(channelId);
    let setting;
    if (TURSO_URL) {
      await ensureTables();
      const res = await turso('SELECT * FROM channel_settings WHERE channel_id = ?', [channelId]);
      const rows = parseRows(res);
      if (rows.length === 0) {
        setting = null;
      } else {
        const [channel_id, guild_id, autoLang] = rows[0];
        setting = { channel_id, guild_id, auto_translate_lang: parseLangList(autoLang) };
      }
    } else {
      const data = load();
      const ch = data.channels[channelId];
      setting = ch
        ? { channel_id: channelId, ...ch, auto_translate_lang: parseLangList(ch.auto_translate_lang) }
        : null;
    }
    cacheChannelSetting(channelId, setting);
    return setting;
  },
  async disableChannelAutoTranslate(channelId) {
    invalidateChannelSetting(channelId);
    if (TURSO_URL) {
      await ensureTables();
      await turso('DELETE FROM channel_settings WHERE channel_id = ?', [channelId]);
      return;
    }
    const data = load();
    if (data.channels[channelId]) {
      delete data.channels[channelId];
      save(data);
    }
  },
  async setChannelTriad(channelId, guildId, langs) {
    const storage = JSON.stringify(langs);
    invalidateChannelSetting(channelId);
    if (TURSO_URL) {
      await ensureTables();
      await turso(
        'INSERT OR REPLACE INTO channel_settings (channel_id, guild_id, auto_translate_lang) VALUES (?, ?, ?)',
        [channelId, guildId, storage]
      );
      return;
    }
    const data = load();
    if (!data.channels[channelId]) data.channels[channelId] = {};
    data.channels[channelId].guild_id = guildId;
    data.channels[channelId].auto_translate_lang = langs;
    save(data);
  },

  close() {},
};