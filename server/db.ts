import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'gameverse.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    avatar_url TEXT NOT NULL,
    password_hash TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    coins INTEGER NOT NULL DEFAULT 100,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    sound_enabled INTEGER NOT NULL DEFAULT 1,
    music_enabled INTEGER NOT NULL DEFAULT 0,
    animations_enabled INTEGER NOT NULL DEFAULT 1,
    theme TEXT NOT NULL DEFAULT 'dark',
    privacy_public_profile INTEGER NOT NULL DEFAULT 1,
    privacy_show_activity INTEGER NOT NULL DEFAULT 1,
    is_seeded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS email_verifications (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS match_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    game_type TEXT NOT NULL,
    mode TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    opponent_name TEXT NOT NULL,
    result TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    xp_earned INTEGER NOT NULL DEFAULT 0,
    coins_earned INTEGER NOT NULL DEFAULT 0,
    details_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_achievements (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    achievement_key TEXT NOT NULL,
    unlocked_at TEXT NOT NULL,
    UNIQUE(user_id, achievement_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS multiplayer_rooms (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    game_type TEXT NOT NULL,
    host_user_id TEXT NOT NULL,
    guest_user_id TEXT,
    status TEXT NOT NULL DEFAULT 'waiting',
    state_json TEXT NOT NULL,
    host_score INTEGER NOT NULL DEFAULT 0,
    guest_score INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL,
    game_type TEXT NOT NULL,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS shared_links (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    site_name TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

export interface DbUser {
  id: string;
  email: string;
  username: string;
  avatar_url: string;
  password_hash: string | null;
  email_verified: number;
  xp: number;
  level: number;
  coins: number;
  current_streak: number;
  best_streak: number;
  sound_enabled: number;
  music_enabled: number;
  animations_enabled: number;
  theme: 'dark' | 'light';
  privacy_public_profile: number;
  privacy_show_activity: number;
  is_seeded: number;
  created_at: string;
  updated_at: string;
}

export const ACHIEVEMENTS_CATALOG = [
  {
    key: 'first_victory',
    title: 'First Victory',
    description: 'Win your very first match in any GAMEVERSE arena.',
    category: 'General',
    rewardCoins: 50,
  },
  {
    key: 'rps_master',
    title: 'Tactician',
    description: 'Win 5 Rock Paper Scissors matches.',
    category: 'Rock Paper Scissors',
    rewardCoins: 120,
  },
  {
    key: 'sharpshooter',
    title: 'Cipher Breaker',
    description: 'Crack Guess the Number in 4 or fewer attempts.',
    category: 'Guess the Number',
    rewardCoins: 150,
  },
  {
    key: 'ttt_grandmaster',
    title: 'Grid Strategist',
    description: 'Win a Tic-Tac-Toe match on Hard AI or Online Multiplayer.',
    category: 'Tic-Tac-Toe',
    rewardCoins: 150,
  },
  {
    key: 'hat_trick',
    title: 'Unstoppable Run',
    description: 'Reach a 3-match winning streak across the platform.',
    category: 'General',
    rewardCoins: 100,
  },
  {
    key: 'century_club',
    title: 'Arena Centurion',
    description: 'Accumulate at least 500 fictional Arena Coins.',
    category: 'Progression',
    rewardCoins: 75,
  },
  {
    key: 'social_duelist',
    title: 'Online Challenger',
    description: 'Complete an online multiplayer match against another player.',
    category: 'Multiplayer',
    rewardCoins: 125,
  },
  {
    key: 'triple_threat',
    title: 'Triple Crown',
    description: 'Earn at least one victory in all three classic games.',
    category: 'General',
    rewardCoins: 200,
  },
] as const;

export function calculateLevel(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 120)) + 1);
}

export function xpForLevel(level: number): number {
  return Math.pow(level - 1, 2) * 120;
}

export function hashSecret(value: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(value, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(value: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(value, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sanitizeUser(user: DbUser) {
  const stats = getUserStats(user.id);
  const currentLevelXp = xpForLevel(user.level);
  const nextLevelXp = xpForLevel(user.level + 1);
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatar_url,
    emailVerified: Boolean(user.email_verified),
    hasPassword: Boolean(user.password_hash),
    xp: user.xp,
    level: user.level,
    currentLevelXp,
    nextLevelXp,
    coins: user.coins,
    currentStreak: user.current_streak,
    bestStreak: user.best_streak,
    settings: {
      soundEnabled: Boolean(user.sound_enabled),
      musicEnabled: Boolean(user.music_enabled),
      animationsEnabled: Boolean(user.animations_enabled),
      theme: user.theme === 'light' ? 'light' : 'dark',
      privacyPublicProfile: Boolean(user.privacy_public_profile),
      privacyShowActivity: Boolean(user.privacy_show_activity),
    },
    stats,
    createdAt: user.created_at,
  };
}

export function getUserStats(userId: string) {
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) as totalGames,
         SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as totalWins,
         SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as totalLosses,
         SUM(CASE WHEN result = 'draw' THEN 1 ELSE 0 END) as totalDraws,
         COALESCE(MAX(score), 0) as highestScore
       FROM match_history
       WHERE user_id = ?`
    )
    .get(userId) as {
    totalGames: number;
    totalWins: number | null;
    totalLosses: number | null;
    totalDraws: number | null;
    highestScore: number;
  };

  const perGameRows = db
    .prepare(
      `SELECT
         game_type as gameType,
         COUNT(*) as played,
         SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
         COALESCE(MAX(score), 0) as highScore
       FROM match_history
       WHERE user_id = ?
       GROUP BY game_type`
    )
    .all(userId) as Array<{
    gameType: string;
    played: number;
    wins: number | null;
    highScore: number;
  }>;

  const perGame: Record<string, { played: number; wins: number; highScore: number }> = {
    rps: { played: 0, wins: 0, highScore: 0 },
    guess: { played: 0, wins: 0, highScore: 0 },
    ttt: { played: 0, wins: 0, highScore: 0 },
  };
  for (const row of perGameRows) {
    perGame[row.gameType] = {
      played: row.played,
      wins: row.wins ?? 0,
      highScore: row.highScore,
    };
  }

  const totalGames = totals.totalGames ?? 0;
  const totalWins = totals.totalWins ?? 0;
  const totalLosses = totals.totalLosses ?? 0;
  const totalDraws = totals.totalDraws ?? 0;
  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  return {
    totalGames,
    totalWins,
    totalLosses,
    totalDraws,
    winRate,
    highestScore: totals.highestScore ?? 0,
    perGame,
  };
}

export function evaluateAchievements(userId: string): string[] {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
  if (!user) return [];

  const unlockedRows = db
    .prepare('SELECT achievement_key FROM user_achievements WHERE user_id = ?')
    .all(userId) as Array<{ achievement_key: string }>;
  const existing = new Set(unlockedRows.map((r) => r.achievement_key));

  const stats = getUserStats(userId);
  const newlyUnlocked: string[] = [];

  const unlock = (key: string) => {
    if (existing.has(key)) return;
    const ach = ACHIEVEMENTS_CATALOG.find((a) => a.key === key);
    if (!ach) return;
    db.prepare(
      'INSERT OR IGNORE INTO user_achievements (id, user_id, achievement_key, unlocked_at) VALUES (?, ?, ?, ?)'
    ).run(crypto.randomUUID(), userId, key, new Date().toISOString());
    db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(ach.rewardCoins, userId);
    existing.add(key);
    newlyUnlocked.push(key);
  };

  if (stats.totalWins >= 1) unlock('first_victory');
  if (stats.perGame.rps.wins >= 5) unlock('rps_master');
  if (user.best_streak >= 3) unlock('hat_trick');
  if (user.coins >= 500) unlock('century_club');
  if (stats.perGame.rps.wins >= 1 && stats.perGame.guess.wins >= 1 && stats.perGame.ttt.wins >= 1) {
    unlock('triple_threat');
  }

  const sharpMatch = db
    .prepare(
      `SELECT details_json FROM match_history
       WHERE user_id = ? AND game_type = 'guess' AND result = 'win'`
    )
    .all(userId) as Array<{ details_json: string | null }>;
  for (const row of sharpMatch) {
    if (!row.details_json) continue;
    try {
      const parsed = JSON.parse(row.details_json);
      if (typeof parsed.attempts === 'number' && parsed.attempts <= 4) {
        unlock('sharpshooter');
        break;
      }
    } catch {
      // ignore malformed json
    }
  }

  const tttHardOrOnline = db
    .prepare(
      `SELECT id FROM match_history
       WHERE user_id = ? AND game_type = 'ttt' AND result = 'win' AND (difficulty = 'hard' OR mode = 'online')
       LIMIT 1`
    )
    .get(userId);
  if (tttHardOrOnline) unlock('ttt_grandmaster');

  const onlineMatch = db
    .prepare(`SELECT id FROM match_history WHERE user_id = ? AND mode = 'online' LIMIT 1`)
    .get(userId);
  if (onlineMatch) unlock('social_duelist');

  return newlyUnlocked;
}

export function recordMatchForUser(params: {
  userId: string;
  gameType: 'rps' | 'guess' | 'ttt';
  mode: 'ai' | 'local' | 'online';
  difficulty: string;
  opponentName: string;
  result: 'win' | 'loss' | 'draw';
  score: number;
  details?: Record<string, unknown>;
}) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(params.userId) as DbUser | undefined;
  if (!user) return null;

  const baseXp = params.result === 'win' ? 60 : params.result === 'draw' ? 25 : 15;
  const diffMultiplier =
    params.difficulty === 'expert' ? 1.8 : params.difficulty === 'hard' ? 1.4 : params.difficulty === 'medium' ? 1.15 : 1;
  const modeBonus = params.mode === 'online' ? 25 : 0;
  const xpEarned = Math.round(baseXp * diffMultiplier + modeBonus);

  const baseCoins = params.result === 'win' ? 40 : params.result === 'draw' ? 15 : 5;
  const coinsEarned = Math.round(baseCoins * diffMultiplier + (params.mode === 'online' ? 20 : 0));

  const newStreak = params.result === 'win' ? user.current_streak + 1 : params.result === 'loss' ? 0 : user.current_streak;
  const bestStreak = Math.max(user.best_streak, newStreak);
  const newXp = user.xp + xpEarned;
  const newLevel = calculateLevel(newXp);
  const newCoins = user.coins + coinsEarned;

  const now = new Date().toISOString();
  const matchId = crypto.randomUUID();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO match_history
       (id, user_id, game_type, mode, difficulty, opponent_name, result, score, xp_earned, coins_earned, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      matchId,
      params.userId,
      params.gameType,
      params.mode,
      params.difficulty,
      params.opponentName,
      params.result,
      params.score,
      xpEarned,
      coinsEarned,
      params.details ? JSON.stringify(params.details) : null,
      now
    );

    db.prepare(
      `UPDATE users
       SET xp = ?, level = ?, coins = ?, current_streak = ?, best_streak = ?, updated_at = ?
       WHERE id = ?`
    ).run(newXp, newLevel, newCoins, newStreak, bestStreak, now, params.userId);
  });

  tx();
  const newlyUnlocked = evaluateAchievements(params.userId);
  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(params.userId) as DbUser;

  return {
    matchId,
    xpEarned,
    coinsEarned,
    newlyUnlocked,
    user: sanitizeUser(updatedUser),
  };
}

function seedCommunityLeaderboard() {
  const count = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (count > 0) return;

  const now = new Date().toISOString();
  const seedPlayers = [
    {
      id: 'seed-player-1',
      email: 'elena.vance@community.gameverse.local',
      username: 'ElenaVance',
      avatar: 'avatar:strategist',
      xp: 1840,
      coins: 920,
      bestStreak: 6,
      wins: 24,
      games: 31,
    },
    {
      id: 'seed-player-2',
      email: 'marcus.chen@community.gameverse.local',
      username: 'MarcusC',
      avatar: 'avatar:tactician',
      xp: 1420,
      coins: 740,
      bestStreak: 5,
      wins: 19,
      games: 28,
    },
    {
      id: 'seed-player-3',
      email: 'nadia.okafor@community.gameverse.local',
      username: 'NadiaGrid',
      avatar: 'avatar:cipher',
      xp: 1120,
      coins: 580,
      bestStreak: 4,
      wins: 15,
      games: 22,
    },
    {
      id: 'seed-player-4',
      email: 'julian.k@community.gameverse.local',
      username: 'JulianK',
      avatar: 'avatar:duelist',
      xp: 790,
      coins: 410,
      bestStreak: 3,
      wins: 11,
      games: 19,
    },
  ];

  for (const p of seedPlayers) {
    const level = calculateLevel(p.xp);
    db.prepare(
      `INSERT INTO users
       (id, email, username, avatar_url, password_hash, email_verified, xp, level, coins, current_streak, best_streak, is_seeded, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, 1, ?, ?, ?, 0, ?, 1, ?, ?)`
    ).run(p.id, p.email, p.username, p.avatar, p.xp, level, p.coins, p.bestStreak, now, now);

    const games = ['rps', 'guess', 'ttt'] as const;
    for (let i = 0; i < p.games; i++) {
      const g = games[i % games.length];
      const result = i < p.wins ? 'win' : i % 4 === 0 ? 'draw' : 'loss';
      db.prepare(
        `INSERT INTO match_history
         (id, user_id, game_type, mode, difficulty, opponent_name, result, score, xp_earned, coins_earned, created_at)
         VALUES (?, ?, ?, 'ai', 'medium', 'Arena Bot', ?, ?, 50, 35, ?)`
      ).run(crypto.randomUUID(), p.id, g, result, result === 'win' ? 120 + i * 10 : 40, now);
    }
  }
}

seedCommunityLeaderboard();
