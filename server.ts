import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  ACHIEVEMENTS_CATALOG,
  db,
  type DbUser,
  hashSecret,
  recordMatchForUser,
  sanitizeUser,
  sha256,
  verifySecret,
} from './server/db.ts';
import { sendVerificationEmail } from './server/email.ts';
import { fetchLinkPreview } from './server/linkPreview.ts';
import {
  broadcastRoomState,
  createInitialRoomState,
  getPublicRoomView,
  pushUserEvent,
  setupMultiplayerWebSocket,
} from './server/multiplayer.ts';

interface AuthedRequest extends Request {
  user?: DbUser;
  sessionToken?: string;
}

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const OTP_DURATION_MS = 1000 * 60 * 10; // 10 minutes

function extractSessionToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)gv_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setSessionCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.APP_URL?.startsWith('https://'));
  res.cookie('gv_session', token, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: SESSION_DURATION_MS,
    path: '/',
  });
}

function createSessionForUser(res: Response, userId: string): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  db.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(crypto.randomUUID(), userId, tokenHash, Date.now() + SESSION_DURATION_MS, Date.now());
  setSessionCookie(res, rawToken);
  return rawToken;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .get(sha256(token), Date.now()) as DbUser | undefined;

  if (!row) {
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    return;
  }

  req.user = row;
  req.sessionToken = token;
  next();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  const httpServer = http.createServer(app);
  setupMultiplayerWebSocket(httpServer);

  // Serve generated game artwork for shareable Open Graph previews
  app.get('/share-media/:key', (req, res) => {
    const mediaMap: Record<string, string> = {
      arena: 'hero_arena_banner_1794673743968.jpg',
      rps: 'rps_game_art_1794673744900.jpg',
      guess: 'number_game_art_1794673744389.jpg',
      ttt: 'tictactoe_game_art_1794673744967.jpg',
    };
    const filename = mediaMap[req.params.key] || mediaMap.arena;
    const filePath = path.resolve(process.cwd(), 'src/assets/images', filename);
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        res.status(404).end();
      }
    });
  });

  // Shareable GAMEVERSE pages with genuine Open Graph metadata for Link Previews
  app.get('/share/:slug', (req, res) => {
    const slug = req.params.slug;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const metaMap: Record<string, { title: string; description: string; imageKey: string }> = {
      arena: {
        title: 'GAMEVERSE — The Ultimate Mini Game Arena',
        description:
          'Play Rock Paper Scissors, Guess the Number, and Tic-Tac-Toe solo or in live online multiplayer with XP, levels, and leaderboards.',
        imageKey: 'arena',
      },
      rps: {
        title: 'Rock Paper Scissors Duel — GAMEVERSE',
        description:
          'Challenge adaptive AI or battle friends live in Rock Paper Scissors on GAMEVERSE.',
        imageKey: 'rps',
      },
      guess: {
        title: 'Guess the Number Cipher Vault — GAMEVERSE',
        description:
          'Crack the secret number across 4 difficulty tiers with smart clues and precision hints on GAMEVERSE.',
        imageKey: 'guess',
      },
      ttt: {
        title: 'Tic-Tac-Toe Strategy Grid — GAMEVERSE',
        description:
          'Outsmart the Minimax AI or duel in 2-player local and online Tic-Tac-Toe on GAMEVERSE.',
        imageKey: 'ttt',
      },
    };

    const meta = metaMap[slug] || {
      title: slug.startsWith('join-')
        ? `Join Multiplayer Room ${slug.replace('join-', '').toUpperCase()} — GAMEVERSE`
        : 'GAMEVERSE — Interactive Mini Game Arena',
      description:
        'You have been invited to play a live match on GAMEVERSE. Sign in with your email to join the arena.',
      imageKey: 'arena',
    };

    const ogImageUrl = `${baseUrl}/share-media/${meta.imageKey}`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(meta.title)}</title>
  <meta name="description" content="${escapeHtml(meta.description)}" />
  <meta property="og:title" content="${escapeHtml(meta.title)}" />
  <meta property="og:description" content="${escapeHtml(meta.description)}" />
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
  <meta property="og:site_name" content="GAMEVERSE" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(`${baseUrl}/share/${slug}`)}" />
</head>
<body style="font-family: system-ui, sans-serif; background:#0B1120; color:#F8FAFC; padding:40px; text-align:center;">
  <h1>${escapeHtml(meta.title)}</h1>
  <p>${escapeHtml(meta.description)}</p>
  <a href="${escapeHtml(baseUrl)}" style="color:#10B981;">Open GAMEVERSE Arena</a>
</body>
</html>`);
  });

  // =========================================================================
  // AUTHENTICATION ENDPOINTS
  // =========================================================================

  app.get('/api/auth/me', (req: AuthedRequest, res) => {
    const token = extractSessionToken(req);
    if (!token) {
      res.status(401).json({ authenticated: false });
      return;
    }
    const user = db
      .prepare(
        `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`
      )
      .get(sha256(token), Date.now()) as DbUser | undefined;

    if (!user) {
      res.status(401).json({ authenticated: false });
      return;
    }

    res.json({ authenticated: true, user: sanitizeUser(user) });
  });

  app.post('/api/auth/request-code', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const purpose = req.body?.purpose === 'reset_password' ? 'reset_password' : 'auth';
      const username = String(req.body?.username || '').trim().slice(0, 28);

      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }

      const existingUser = db
        .prepare('SELECT * FROM users WHERE email = ? AND is_seeded = 0')
        .get(email) as DbUser | undefined;

      if (purpose === 'reset_password' && !existingUser) {
        res.status(404).json({ error: 'No account found with that email address.' });
        return;
      }

      // Rate-limit resend to once every 20 seconds per email
      const recentCode = db
        .prepare(
          'SELECT created_at FROM email_verifications WHERE email = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1'
        )
        .get(email, purpose) as { created_at: number } | undefined;

      if (recentCode && Date.now() - recentCode.created_at < 20_000) {
        const waitSec = Math.ceil((20_000 - (Date.now() - recentCode.created_at)) / 1000);
        res.status(429).json({ error: `Please wait ${waitSec}s before requesting another verification code.` });
        return;
      }

      const code = String(crypto.randomInt(100000, 1000000));
      const codeHash = hashSecret(code);
      const now = Date.now();

      db.prepare('UPDATE email_verifications SET used = 1 WHERE email = ? AND purpose = ? AND used = 0').run(
        email,
        purpose
      );

      db.prepare(
        `INSERT INTO email_verifications (id, email, purpose, code_hash, expires_at, attempts, used, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?)`
      ).run(crypto.randomUUID(), email, purpose, codeHash, now + OTP_DURATION_MS, now);

      const delivery = await sendVerificationEmail({
        to: email,
        code,
        purpose,
        username: username || existingUser?.username,
      });

      res.json({
        ok: true,
        existingAccount: Boolean(existingUser),
        deliveryMode: delivery.mode,
        message:
          delivery.mode === 'ethereal'
            ? 'Verification code dispatched through the SMTP relay. Check your configured email or server relay logs.'
            : 'A 6-digit verification code has been sent to your email address.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send verification email.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/auth/verify-code', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    const username = String(req.body?.username || '').trim().slice(0, 28);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Valid email address is required.' });
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'Please enter the 6-digit verification code.' });
      return;
    }

    const record = db
      .prepare(
        `SELECT * FROM email_verifications
         WHERE email = ? AND purpose = 'auth' AND used = 0
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(email) as
      | {
          id: string;
          code_hash: string;
          expires_at: number;
          attempts: number;
        }
      | undefined;

    if (!record) {
      res.status(400).json({ error: 'No active verification code found. Please request a new code.' });
      return;
    }

    if (Date.now() > record.expires_at) {
      db.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').run(record.id);
      res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
      return;
    }

    if (record.attempts >= 5) {
      db.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').run(record.id);
      res.status(429).json({ error: 'Too many incorrect attempts. Please request a new verification code.' });
      return;
    }

    if (!verifySecret(code, record.code_hash)) {
      db.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?').run(record.id);
      res.status(400).json({ error: 'Incorrect verification code. Please check and try again.' });
      return;
    }

    db.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').run(record.id);

    let user = db
      .prepare('SELECT * FROM users WHERE email = ? AND is_seeded = 0')
      .get(email) as DbUser | undefined;

    const now = new Date().toISOString();
    if (!user) {
      const derivedName =
        username ||
        email
          .split('@')[0]
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 20) ||
        'Player';
      const passwordHash = password && password.length >= 6 ? hashSecret(password) : null;
      const newId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO users
         (id, email, username, avatar_url, password_hash, email_verified, xp, level, coins, created_at, updated_at)
         VALUES (?, ?, ?, 'avatar:champion', ?, 1, 0, 1, 150, ?, ?)`
      ).run(newId, email, derivedName, passwordHash, now, now);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(newId) as DbUser;
    } else {
      db.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?').run(now, user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
    }

    const token = createSessionForUser(res, user.id);
    res.json({ ok: true, token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/login-password', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!isValidEmail(email) || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = db
      .prepare('SELECT * FROM users WHERE email = ? AND is_seeded = 0')
      .get(email) as DbUser | undefined;

    if (!user || !user.password_hash || !verifySecret(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (!user.email_verified) {
      res.status(403).json({ error: 'Please verify your email address with a verification code first.' });
      return;
    }

    const token = createSessionForUser(res, user.id);
    res.json({ ok: true, token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Valid email is required.' });
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'Please enter the 6-digit recovery code.' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }

    const record = db
      .prepare(
        `SELECT * FROM email_verifications
         WHERE email = ? AND purpose = 'reset_password' AND used = 0
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(email) as { id: string; code_hash: string; expires_at: number; attempts: number } | undefined;

    if (!record || Date.now() > record.expires_at || record.attempts >= 5) {
      res.status(400).json({ error: 'Recovery code is invalid or expired. Please request a new code.' });
      return;
    }

    if (!verifySecret(code, record.code_hash)) {
      db.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?').run(record.id);
      res.status(400).json({ error: 'Incorrect recovery code.' });
      return;
    }

    const user = db
      .prepare('SELECT * FROM users WHERE email = ? AND is_seeded = 0')
      .get(email) as DbUser | undefined;
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    db.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').run(record.id);
    db.prepare('UPDATE users SET password_hash = ?, email_verified = 1, updated_at = ? WHERE id = ?').run(
      hashSecret(newPassword),
      new Date().toISOString(),
      user.id
    );

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
    const token = createSessionForUser(res, user.id);
    res.json({ ok: true, token, user: sanitizeUser(updated) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = extractSessionToken(req);
    if (token) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    }
    res.clearCookie('gv_session', { path: '/' });
    res.json({ ok: true });
  });

  // =========================================================================
  // PLAYER PROFILE, SETTINGS & PROGRESSION
  // =========================================================================

  app.patch('/api/profile', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const username =
      typeof req.body?.username === 'string' && req.body.username.trim().length >= 2
        ? req.body.username.trim().slice(0, 28)
        : user.username;
    const avatarUrl =
      typeof req.body?.avatarUrl === 'string' && req.body.avatarUrl.trim()
        ? req.body.avatarUrl.trim().slice(0, 300)
        : user.avatar_url;

    const settings = req.body?.settings || {};
    const soundEnabled = typeof settings.soundEnabled === 'boolean' ? (settings.soundEnabled ? 1 : 0) : user.sound_enabled;
    const musicEnabled = typeof settings.musicEnabled === 'boolean' ? (settings.musicEnabled ? 1 : 0) : user.music_enabled;
    const animationsEnabled =
      typeof settings.animationsEnabled === 'boolean' ? (settings.animationsEnabled ? 1 : 0) : user.animations_enabled;
    const theme = settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : user.theme;
    const privacyPublicProfile =
      typeof settings.privacyPublicProfile === 'boolean'
        ? settings.privacyPublicProfile
          ? 1
          : 0
        : user.privacy_public_profile;
    const privacyShowActivity =
      typeof settings.privacyShowActivity === 'boolean'
        ? settings.privacyShowActivity
          ? 1
          : 0
        : user.privacy_show_activity;

    db.prepare(
      `UPDATE users
       SET username = ?, avatar_url = ?, sound_enabled = ?, music_enabled = ?,
           animations_enabled = ?, theme = ?, privacy_public_profile = ?,
           privacy_show_activity = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      username,
      avatarUrl,
      soundEnabled,
      musicEnabled,
      animationsEnabled,
      theme,
      privacyPublicProfile,
      privacyShowActivity,
      new Date().toISOString(),
      user.id
    );

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
    res.json({ ok: true, user: sanitizeUser(updated) });
  });

  app.post('/api/profile/password', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    if (user.password_hash && !verifySecret(currentPassword, user.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashSecret(newPassword),
      new Date().toISOString(),
      user.id
    );

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
    res.json({ ok: true, user: sanitizeUser(updated) });
  });

  app.get('/api/achievements', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare('SELECT achievement_key, unlocked_at FROM user_achievements WHERE user_id = ?')
      .all(req.user!.id) as Array<{ achievement_key: string; unlocked_at: string }>;
    const unlockedMap = new Map(rows.map((r) => [r.achievement_key, r.unlocked_at]));

    const list = ACHIEVEMENTS_CATALOG.map((a) => ({
      ...a,
      unlocked: unlockedMap.has(a.key),
      unlockedAt: unlockedMap.get(a.key) || null,
    }));
    res.json({ achievements: list });
  });

  app.get('/api/matches', requireAuth, (req: AuthedRequest, res) => {
    const limit = Math.min(50, Math.max(5, Number(req.query.limit || 25)));
    const rows = db
      .prepare(
        `SELECT id, game_type as gameType, mode, difficulty, opponent_name as opponentName,
                result, score, xp_earned as xpEarned, coins_earned as coinsEarned,
                details_json as detailsJson, created_at as createdAt
         FROM match_history
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(req.user!.id, limit);
    res.json({ matches: rows });
  });

  app.post('/api/matches', requireAuth, (req: AuthedRequest, res) => {
    const gameType = req.body?.gameType;
    const mode = req.body?.mode || 'ai';
    const difficulty = String(req.body?.difficulty || 'medium');
    const opponentName = String(req.body?.opponentName || 'Arena Bot').slice(0, 40);
    const result = req.body?.result;
    const score = Math.max(0, Math.min(10000, Number(req.body?.score || 0)));
    const details = typeof req.body?.details === 'object' && req.body.details ? req.body.details : undefined;

    if (!['rps', 'guess', 'ttt'].includes(gameType)) {
      res.status(400).json({ error: 'Invalid game type.' });
      return;
    }
    if (!['ai', 'local', 'online'].includes(mode)) {
      res.status(400).json({ error: 'Invalid mode.' });
      return;
    }
    if (!['win', 'loss', 'draw'].includes(result)) {
      res.status(400).json({ error: 'Invalid match result.' });
      return;
    }

    const outcome = recordMatchForUser({
      userId: req.user!.id,
      gameType,
      mode,
      difficulty,
      opponentName,
      result,
      score,
      details,
    });

    res.json({ ok: true, ...outcome });
  });

  app.get('/api/leaderboard', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.username, u.avatar_url as avatarUrl, u.xp, u.level, u.coins, u.best_streak as bestStreak,
                u.is_seeded as isSeeded,
                COUNT(m.id) as totalGames,
                SUM(CASE WHEN m.result = 'win' THEN 1 ELSE 0 END) as totalWins
         FROM users u
         LEFT JOIN match_history m ON m.user_id = u.id
         WHERE u.privacy_public_profile = 1 OR u.id = ?
         GROUP BY u.id
         ORDER BY u.xp DESC, totalWins DESC
         LIMIT 25`
      )
      .all(req.user!.id) as Array<{
      id: string;
      username: string;
      avatarUrl: string;
      xp: number;
      level: number;
      coins: number;
      bestStreak: number;
      isSeeded: number;
      totalGames: number;
      totalWins: number | null;
    }>;

    res.json({
      leaderboard: rows.map((r, idx) => ({
        rank: idx + 1,
        id: r.id,
        username: r.username,
        avatarUrl: r.avatarUrl,
        xp: r.xp,
        level: r.level,
        coins: r.coins,
        bestStreak: r.bestStreak,
        totalGames: r.totalGames,
        totalWins: r.totalWins ?? 0,
        winRate: r.totalGames > 0 ? Math.round(((r.totalWins ?? 0) / r.totalGames) * 100) : 0,
        isCurrentUser: r.id === req.user!.id,
      })),
    });
  });

  // =========================================================================
  // MULTIPLAYER ROOMS & INVITATIONS
  // =========================================================================

  app.get('/api/rooms', requireAuth, (req: AuthedRequest, res) => {
    const rooms = db
      .prepare(
        `SELECT r.code, r.game_type as gameType, r.status, r.created_at as createdAt,
                h.username as hostUsername, h.id as hostId,
                g.username as guestUsername, g.id as guestId
         FROM multiplayer_rooms r
         JOIN users h ON h.id = r.host_user_id
         LEFT JOIN users g ON g.id = r.guest_user_id
         WHERE r.status IN ('waiting', 'playing')
         ORDER BY r.updated_at DESC
         LIMIT 20`
      )
      .all();

    const invitations = db
      .prepare(
        `SELECT i.id, i.room_code as roomCode, i.game_type as gameType, i.status, i.created_at as createdAt,
                u.username as fromUsername, u.avatar_url as fromAvatar
         FROM invitations i
         JOIN users u ON u.id = i.from_user_id
         WHERE i.to_user_id = ? AND i.status = 'pending'
         ORDER BY i.created_at DESC`
      )
      .all(req.user!.id);

    res.json({ rooms, invitations });
  });

  app.post('/api/rooms', requireAuth, (req: AuthedRequest, res) => {
    const gameType = req.body?.gameType === 'rps' ? 'rps' : 'ttt';
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    const now = new Date().toISOString();
    const initialState = createInitialRoomState(gameType);

    db.prepare(
      `INSERT INTO multiplayer_rooms
       (id, code, game_type, host_user_id, guest_user_id, status, state_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, 'waiting', ?, ?, ?)`
    ).run(crypto.randomUUID(), code, gameType, req.user!.id, JSON.stringify(initialState), now, now);

    const view = getPublicRoomView(code, req.user!.id);
    res.json({ ok: true, room: view });
  });

  app.post('/api/rooms/:code/join', requireAuth, (req: AuthedRequest, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = db.prepare('SELECT * FROM multiplayer_rooms WHERE code = ?').get(code) as
      | {
          id: string;
          code: string;
          host_user_id: string;
          guest_user_id: string | null;
          status: string;
        }
      | undefined;

    if (!room) {
      res.status(404).json({ error: 'Room code not found.' });
      return;
    }

    if (room.host_user_id !== req.user!.id && room.guest_user_id && room.guest_user_id !== req.user!.id) {
      res.status(409).json({ error: 'This room already has two players.' });
      return;
    }

    if (room.host_user_id !== req.user!.id && !room.guest_user_id) {
      db.prepare(
        `UPDATE multiplayer_rooms SET guest_user_id = ?, status = 'playing', updated_at = ? WHERE code = ?`
      ).run(req.user!.id, new Date().toISOString(), code);
      broadcastRoomState(code);
    }

    const view = getPublicRoomView(code, req.user!.id);
    res.json({ ok: true, room: view });
  });

  app.post('/api/invitations', requireAuth, (req: AuthedRequest, res) => {
    const roomCode = String(req.body?.roomCode || '').trim().toUpperCase();
    const target = String(req.body?.target || '').trim().toLowerCase();

    if (!roomCode || !target) {
      res.status(400).json({ error: 'Room code and recipient username or email are required.' });
      return;
    }

    const room = db.prepare('SELECT * FROM multiplayer_rooms WHERE code = ?').get(roomCode) as
      | { game_type: string; host_user_id: string }
      | undefined;
    if (!room) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }

    const recipient = db
      .prepare(
        'SELECT * FROM users WHERE (LOWER(email) = ? OR LOWER(username) = ?) AND is_seeded = 0 LIMIT 1'
      )
      .get(target, target) as DbUser | undefined;

    if (!recipient) {
      res.status(404).json({ error: 'No registered player found with that username or email.' });
      return;
    }
    if (recipient.id === req.user!.id) {
      res.status(400).json({ error: 'You cannot invite yourself to a match.' });
      return;
    }

    const inviteId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO invitations (id, room_code, game_type, from_user_id, to_user_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`
    ).run(inviteId, roomCode, room.game_type, req.user!.id, recipient.id, now);

    pushUserEvent(recipient.id, 'invite:received', {
      id: inviteId,
      roomCode,
      gameType: room.game_type,
      fromUsername: req.user!.username,
      fromAvatar: req.user!.avatar_url,
      createdAt: now,
    });

    res.json({ ok: true, invitedUsername: recipient.username });
  });

  app.post('/api/invitations/:id/respond', requireAuth, (req: AuthedRequest, res) => {
    const id = req.params.id;
    const action = req.body?.action === 'accept' ? 'accepted' : 'declined';

    const invite = db
      .prepare('SELECT * FROM invitations WHERE id = ? AND to_user_id = ?')
      .get(id, req.user!.id) as { id: string; room_code: string } | undefined;

    if (!invite) {
      res.status(404).json({ error: 'Invitation not found.' });
      return;
    }

    db.prepare('UPDATE invitations SET status = ? WHERE id = ?').run(action, id);

    if (action === 'accepted') {
      const room = db.prepare('SELECT * FROM multiplayer_rooms WHERE code = ?').get(invite.room_code) as
        | { host_user_id: string; guest_user_id: string | null }
        | undefined;
      if (room && !room.guest_user_id && room.host_user_id !== req.user!.id) {
        db.prepare(
          `UPDATE multiplayer_rooms SET guest_user_id = ?, status = 'playing', updated_at = ? WHERE code = ?`
        ).run(req.user!.id, new Date().toISOString(), invite.room_code);
        broadcastRoomState(invite.room_code);
      }
    }

    res.json({ ok: true, status: action, roomCode: invite.room_code });
  });

  // =========================================================================
  // MANDATORY FUNCTIONAL LINK PREVIEW ENDPOINTS
  // =========================================================================

  app.get('/api/link-preview', requireAuth, async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      res.status(400).json({ error: 'A URL parameter is required.' });
      return;
    }
    try {
      const selfOrigin = `${req.protocol}://${req.get('host')}`;
      const preview = await fetchLinkPreview(rawUrl, selfOrigin);
      res.json({ ok: true, preview });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid URL';
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/shared-links', requireAuth, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT s.id, s.url, s.title, s.description, s.image_url as imageUrl, s.site_name as siteName,
                s.note, s.created_at as createdAt, u.username, u.avatar_url as avatarUrl
         FROM shared_links s
         JOIN users u ON u.id = s.user_id
         ORDER BY s.created_at DESC
         LIMIT 20`
      )
      .all();
    res.json({ links: rows });
  });

  app.post('/api/shared-links', requireAuth, async (req: AuthedRequest, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    const note = String(req.body?.note || '').trim().slice(0, 180);
    if (!rawUrl) {
      res.status(400).json({ error: 'Please provide a valid URL to share.' });
      return;
    }
    try {
      const selfOrigin = `${req.protocol}://${req.get('host')}`;
      const preview = await fetchLinkPreview(rawUrl, selfOrigin);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO shared_links (id, user_id, url, title, description, image_url, site_name, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        req.user!.id,
        preview.finalUrl,
        preview.title,
        preview.description,
        preview.image,
        preview.siteName,
        note || null,
        now
      );
      res.json({
        ok: true,
        sharedLink: {
          id,
          url: preview.finalUrl,
          title: preview.title,
          description: preview.description,
          imageUrl: preview.image,
          siteName: preview.siteName,
          note: note || null,
          createdAt: now,
          username: req.user!.username,
          avatarUrl: req.user!.avatar_url,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to share link.';
      res.status(400).json({ error: message });
    }
  });

  // =========================================================================
  // VITE / STATIC SERVING
  // =========================================================================

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`GAMEVERSE server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start GAMEVERSE server:', err);
  process.exit(1);
});
