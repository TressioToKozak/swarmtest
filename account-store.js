'use strict';
const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto');

const ACCOUNT_PROGRESS_KEYS = Object.freeze([
  'swarmfall-stats',
  'swarmfall-achievements-v1',
  'swarmfall-unlocked',
  'swarmfall-modes',
  'swarmfall-nightmare-cosmetic',
  'swarmfall-save-v1',
  'swarmfall-character',
  'swarmfall-map',
  'swarmfall-mode',
]);
const ACCOUNT_PROGRESS_KEY_SET = new Set(ACCOUNT_PROGRESS_KEYS);
const SERVER_PROGRESS_KEYS = Object.freeze([
  'swarmfall-stats',
  'swarmfall-achievements-v1',
  'swarmfall-unlocked',
  'swarmfall-modes',
  'swarmfall-nightmare-cosmetic',
]);
const SERVER_PROGRESS_KEY_SET = new Set(SERVER_PROGRESS_KEYS);

function emptyDatabase() {
  return { users: [], sessions: {} };
}
function validDatabase(value) {
  return Boolean(
    value &&
    Array.isArray(value.users) &&
    value.sessions &&
    typeof value.sessions === 'object' &&
    !Array.isArray(value.sessions),
  );
}
function normalizeLogin(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (error, key) =>
      error ? reject(error) : resolve({ salt, hash: key.toString('hex') }),
    ),
  );
}
function passwordMatches(password, user) {
  return new Promise((resolve) =>
    crypto.scrypt(password, user.passwordSalt, 64, (error, key) => {
      if (error) return resolve(false);
      try {
        resolve(crypto.timingSafeEqual(Buffer.from(user.passwordHash, 'hex'), key));
      } catch {
        resolve(false);
      }
    }),
  );
}
function cleanProgress(progress) {
  return Object.fromEntries(
    Object.entries(progress || {}).filter(
      ([key, value]) =>
        ACCOUNT_PROGRESS_KEY_SET.has(key) && typeof value === 'string' && value.length < 800000,
    ),
  );
}
function mergeClientProgress(current, incoming) {
  const safe = cleanProgress(incoming),
    merged = Object.fromEntries(
      Object.entries(safe).filter(([key]) => !SERVER_PROGRESS_KEY_SET.has(key)),
    );
  for (const key of SERVER_PROGRESS_KEYS)
    if (typeof current?.[key] === 'string') merged[key] = current[key];
  return merged;
}
const DEFAULT_STATS = {
  bestTime: 0,
  totalTime: 0,
  bestKills: 0,
  totalKills: 0,
  coins: 0,
  characterGames: { scout: 0, warrior: 0, druid: 0 },
};
function mergeMultiplayerStats(raw, result) {
  let parsed = {};
  try {
    parsed = JSON.parse(raw || '{}');
  } catch {}
  const stats = {
      ...DEFAULT_STATS,
      ...parsed,
      characterGames: { ...DEFAULT_STATS.characterGames, ...parsed.characterGames },
    },
    time = Math.max(0, Math.floor(result.time || 0)),
    kills = Math.max(0, Math.floor(result.kills || 0)),
    coins = Math.max(0, Math.floor(result.coins || 0)),
    character = ['scout', 'warrior', 'druid'].includes(result.character)
      ? result.character
      : 'scout';
  stats.bestTime = Math.max(stats.bestTime || 0, time);
  stats.totalTime = Math.max(0, stats.totalTime || 0) + time;
  stats.bestKills = Math.max(stats.bestKills || 0, kills);
  stats.totalKills = Math.max(0, stats.totalKills || 0) + kills;
  stats.coins = Math.max(0, stats.coins || 0) + coins;
  stats.characterGames[character] = Math.max(0, stats.characterGames[character] || 0) + 1;
  return JSON.stringify(stats);
}

class AccountStore {
  constructor(file) {
    this.file = file;
    this.data = null;
    this.queue = Promise.resolve();
  }
  async load() {
    if (this.data) return this.data;
    try {
      const raw = await fs.readFile(this.file, 'utf8'),
        parsed = JSON.parse(raw);
      if (!validDatabase(parsed)) throw new Error('Nieprawidłowa struktura bazy kont.');
      this.data = parsed;
      for (const user of this.data.users) {
        user.progress = cleanProgress(user.progress);
        user.revision =
          Number.isSafeInteger(user.revision) && user.revision >= 0 ? user.revision : 0;
      }
      return this.data;
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.data = emptyDatabase();
        return this.data;
      }
      const controlled = new Error('Baza kont jest uszkodzona lub niedostępna.');
      controlled.code = 'ACCOUNT_STORE_CORRUPTED';
      controlled.cause = error;
      throw controlled;
    }
  }
  run(operation) {
    const task = this.queue.then(async () => operation(await this.load()));
    this.queue = task.catch(() => {});
    return task;
  }
  async persist(data) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(data));
    await fs.rename(temporary, this.file);
  }
  read(operation) {
    return this.run((data) => operation(data));
  }
  mutate(operation) {
    return this.run(async (data) => {
      const draft = structuredClone(data),
        result = await operation(draft);
      await this.persist(draft);
      this.data = draft;
      return result;
    });
  }
  accountForToken(token) {
    if (!token) return Promise.resolve(null);
    const key = crypto.createHash('sha256').update(token).digest('hex');
    return this.run(async (data) => {
      const session = data.sessions[key];
      if (!session) return null;
      if (session.expiresAt < Date.now()) {
        const draft = structuredClone(data);
        delete draft.sessions[key];
        await this.persist(draft);
        this.data = draft;
        return null;
      }
      const user = data.users.find((candidate) => candidate.id === session.userId);
      return user
        ? { id: user.id, login: user.login, progress: cleanProgress(user.progress) }
        : null;
    });
  }
  settleMultiplayerMatch(userId, matchId, result) {
    return this.mutate((data) => {
      const user = data.users.find((candidate) => candidate.id === userId);
      if (!user) return { applied: false, reason: 'account-missing' };
      user.settledMatches = Array.isArray(user.settledMatches) ? user.settledMatches : [];
      const settlementKey = `${matchId}:${result.playerId}`;
      if (user.settledMatches.includes(settlementKey))
        return { applied: false, reason: 'duplicate', revision: user.revision || 0 };
      user.progress = cleanProgress(user.progress);
      user.progress['swarmfall-stats'] = mergeMultiplayerStats(
        user.progress['swarmfall-stats'],
        result,
      );
      user.settledMatches.push(settlementKey);
      user.settledMatches = user.settledMatches.slice(-1000);
      user.revision = (user.revision || 0) + 1;
      user.lastRevisionKind = 'multiplayer-settlement';
      return { applied: true, revision: user.revision, progress: user.progress };
    });
  }
}

module.exports = {
  AccountStore,
  ACCOUNT_PROGRESS_KEYS,
  ACCOUNT_PROGRESS_KEY_SET,
  SERVER_PROGRESS_KEYS,
  SERVER_PROGRESS_KEY_SET,
  normalizeLogin,
  hashPassword,
  passwordMatches,
  cleanProgress,
  mergeClientProgress,
  mergeMultiplayerStats,
};
