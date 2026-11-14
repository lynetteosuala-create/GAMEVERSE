import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { db, type DbUser, recordMatchForUser, sha256 } from './db.ts';

type RpsMove = 'rock' | 'paper' | 'scissors';

interface RoomState {
  gameType: 'rps' | 'ttt';
  // TTT fields
  board?: Array<'X' | 'O' | null>;
  turn?: 'X' | 'O';
  winner?: 'X' | 'O' | 'draw' | null;
  winningLine?: number[] | null;
  // RPS fields
  round?: number;
  hostMove?: RpsMove | null;
  guestMove?: RpsMove | null;
  lastRound?: {
    round: number;
    hostMove: RpsMove;
    guestMove: RpsMove;
    winner: 'host' | 'guest' | 'draw';
  } | null;
  rematchVotes?: string[];
  chat?: Array<{ id: string; username: string; text: string; createdAt: string }>;
}

interface AuthedSocket extends WebSocket {
  userId?: string;
  username?: string;
  roomCode?: string;
}

const roomClients = new Map<string, Set<AuthedSocket>>();
const userSockets = new Map<string, Set<AuthedSocket>>();

function parseTokenFromReq(req: IncomingMessage): string | null {
  const url = new URL(req.url || '/', 'http://localhost');
  const queryToken = url.searchParams.get('token');
  if (queryToken) return queryToken;
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)gv_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function authenticateToken(token: string | null): DbUser | null {
  if (!token) return null;
  const tokenHash = sha256(token);
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .get(tokenHash, Date.now()) as DbUser | undefined;
  return row ?? null;
}

function checkTttWinner(board: Array<'X' | 'O' | null>): {
  winner: 'X' | 'O' | 'draw' | null;
  line: number[] | null;
} {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every((cell) => cell !== null)) {
    return { winner: 'draw', line: null };
  }
  return { winner: null, line: null };
}

function resolveRps(hostMove: RpsMove, guestMove: RpsMove): 'host' | 'guest' | 'draw' {
  if (hostMove === guestMove) return 'draw';
  if (
    (hostMove === 'rock' && guestMove === 'scissors') ||
    (hostMove === 'paper' && guestMove === 'rock') ||
    (hostMove === 'scissors' && guestMove === 'paper')
  ) {
    return 'host';
  }
  return 'guest';
}

export function createInitialRoomState(gameType: 'rps' | 'ttt'): RoomState {
  if (gameType === 'ttt') {
    return {
      gameType: 'ttt',
      board: Array(9).fill(null),
      turn: 'X',
      winner: null,
      winningLine: null,
      rematchVotes: [],
      chat: [],
    };
  }
  return {
    gameType: 'rps',
    round: 1,
    hostMove: null,
    guestMove: null,
    lastRound: null,
    rematchVotes: [],
    chat: [],
  };
}

export function getPublicRoomView(roomCode: string, viewerUserId: string) {
  const room = db
    .prepare(
      `SELECT r.*,
              h.username as host_username, h.avatar_url as host_avatar,
              g.username as guest_username, g.avatar_url as guest_avatar
       FROM multiplayer_rooms r
       JOIN users h ON h.id = r.host_user_id
       LEFT JOIN users g ON g.id = r.guest_user_id
       WHERE r.code = ?`
    )
    .get(roomCode) as
    | {
        id: string;
        code: string;
        game_type: 'rps' | 'ttt';
        host_user_id: string;
        guest_user_id: string | null;
        status: string;
        state_json: string;
        host_score: number;
        guest_score: number;
        draws: number;
        host_username: string;
        host_avatar: string;
        guest_username: string | null;
        guest_avatar: string | null;
      }
    | undefined;

  if (!room) return null;
  const rawState = JSON.parse(room.state_json) as RoomState;
  const isHost = room.host_user_id === viewerUserId;
  const isGuest = room.guest_user_id === viewerUserId;

  // Hide opponent's locked RPS move until both players lock in
  const sanitizedState: RoomState = {
    ...rawState,
    hostMove: rawState.gameType === 'rps' ? (isHost ? rawState.hostMove : rawState.hostMove ? ('locked' as unknown as RpsMove) : null) : undefined,
    guestMove: rawState.gameType === 'rps' ? (isGuest ? rawState.guestMove : rawState.guestMove ? ('locked' as unknown as RpsMove) : null) : undefined,
  };

  return {
    id: room.id,
    code: room.code,
    gameType: room.game_type,
    status: room.status,
    host: {
      id: room.host_user_id,
      username: room.host_username,
      avatarUrl: room.host_avatar,
      score: room.host_score,
    },
    guest: room.guest_user_id
      ? {
          id: room.guest_user_id,
          username: room.guest_username || 'Guest',
          avatarUrl: room.guest_avatar || 'avatar:strategist',
          score: room.guest_score,
        }
      : null,
    draws: room.draws,
    role: isHost ? 'host' : isGuest ? 'guest' : 'spectator',
    state: sanitizedState,
  };
}

export function broadcastRoomState(roomCode: string) {
  const clients = roomClients.get(roomCode);
  if (!clients) return;
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN && client.userId) {
      const view = getPublicRoomView(roomCode, client.userId);
      if (view) {
        client.send(JSON.stringify({ type: 'room:state', payload: view }));
      }
    }
  }
}

export function pushUserEvent(userId: string, type: string, payload: unknown) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const message = JSON.stringify({ type, payload });
  for (const sock of sockets) {
    if (sock.readyState === WebSocket.OPEN) {
      sock.send(message);
    }
  }
}

export function setupMultiplayerWebSocket(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: AuthedSocket, req) => {
    const token = parseTokenFromReq(req);
    const user = authenticateToken(token);
    if (!user) {
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'Authentication required for multiplayer.' } }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    ws.userId = user.id;
    ws.username = user.username;

    if (!userSockets.has(user.id)) {
      userSockets.set(user.id, new Set());
    }
    userSockets.get(user.id)!.add(ws);

    ws.send(JSON.stringify({ type: 'ws:connected', payload: { userId: user.id, username: user.username } }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; payload?: Record<string, unknown> };
        const payload = msg.payload || {};

        if (msg.type === 'room:subscribe') {
          const code = String(payload.code || '').trim().toUpperCase();
          if (!code) return;
          if (ws.roomCode && roomClients.has(ws.roomCode)) {
            roomClients.get(ws.roomCode)!.delete(ws);
          }
          ws.roomCode = code;
          if (!roomClients.has(code)) {
            roomClients.set(code, new Set());
          }
          roomClients.get(code)!.add(ws);
          const view = getPublicRoomView(code, user.id);
          if (view) {
            ws.send(JSON.stringify({ type: 'room:state', payload: view }));
          }
          return;
        }

        if (msg.type === 'ttt:move') {
          const code = String(payload.code || ws.roomCode || '').toUpperCase();
          const cellIndex = Number(payload.index);
          if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8) return;

          const room = db.prepare('SELECT * FROM multiplayer_rooms WHERE code = ?').get(code) as
            | {
                id: string;
                code: string;
                game_type: string;
                host_user_id: string;
                guest_user_id: string | null;
                status: string;
                state_json: string;
                host_score: number;
                guest_score: number;
                draws: number;
              }
            | undefined;
          if (!room || room.game_type !== 'ttt' || !room.guest_user_id) return;

          const state = JSON.parse(room.state_json) as RoomState;
          if (!state.board || state.winner) return;

          const playerSymbol =
            room.host_user_id === user.id ? 'X' : room.guest_user_id === user.id ? 'O' : null;
          if (!playerSymbol || state.turn !== playerSymbol || state.board[cellIndex] !== null) {
            return;
          }

          state.board[cellIndex] = playerSymbol;
          const outcome = checkTttWinner(state.board);
          state.winner = outcome.winner;
          state.winningLine = outcome.line;
          state.turn = playerSymbol === 'X' ? 'O' : 'X';

          let hostScore = room.host_score;
          let guestScore = room.guest_score;
          let draws = room.draws;
          let status = room.status;

          if (outcome.winner) {
            status = 'finished';
            if (outcome.winner === 'X') hostScore += 1;
            else if (outcome.winner === 'O') guestScore += 1;
            else draws += 1;

            const hostRow = db.prepare('SELECT username FROM users WHERE id = ?').get(room.host_user_id) as { username: string };
            const guestRow = db.prepare('SELECT username FROM users WHERE id = ?').get(room.guest_user_id) as { username: string };

            recordMatchForUser({
              userId: room.host_user_id,
              gameType: 'ttt',
              mode: 'online',
              difficulty: 'online',
              opponentName: guestRow.username,
              result: outcome.winner === 'X' ? 'win' : outcome.winner === 'O' ? 'loss' : 'draw',
              score: outcome.winner === 'X' ? 150 : outcome.winner === 'draw' ? 60 : 20,
            });
            recordMatchForUser({
              userId: room.guest_user_id,
              gameType: 'ttt',
              mode: 'online',
              difficulty: 'online',
              opponentName: hostRow.username,
              result: outcome.winner === 'O' ? 'win' : outcome.winner === 'X' ? 'loss' : 'draw',
              score: outcome.winner === 'O' ? 150 : outcome.winner === 'draw' ? 60 : 20,
            });
          }

          db.prepare(
            `UPDATE multiplayer_rooms
             SET state_json = ?, host_score = ?, guest_score = ?, draws = ?, status = ?, updated_at = ?
             WHERE code = ?`
          ).run(JSON.stringify(state), hostScore, guestScore, draws, status, new Date().toISOString(), code);

          broadcastRoomState(code);
          return;
        }

        if (msg.type === 'rps:move') {
          const code = String(payload.code || ws.roomCode || '').toUpperCase();
          const move = String(payload.move || '') as RpsMove;
          if (!['rock', 'paper', 'scissors'].includes(move)) return;

          const room = db.prepare('SELECT * FROM multiplayer_rooms WHERE code = ?').get(code) as
            | {
                code: string;
                game_type: string;
                host_user_id: string;
                guest_user_id: string | null;
                status: string;
                state_json: string;
                host_score: number;
                guest_score: number;
                draws: number;
              }
            | undefined;
          if (!room || room.game_type !== 'rps' || !room.guest_user_id) return;

          const state = JSON.parse(room.state_json) as RoomState;
          if (room.host_user_id === user.id && !state.hostMove) {
            state.hostMove = move;
          } else if (room.guest_user_id === user.id && !state.guestMove) {
            state.guestMove = move;
          } else {
            return;
          }

          let hostScore = room.host_score;
          let guestScore = room.guest_score;
          let draws = room.draws;

          if (state.hostMove && state.guestMove) {
            const roundWinner = resolveRps(state.hostMove, state.guestMove);
            if (roundWinner === 'host') hostScore += 1;
            else if (roundWinner === 'guest') guestScore += 1;
            else draws += 1;

            const currentRound = state.round ?? 1;
            state.lastRound = {
              round: currentRound,
              hostMove: state.hostMove,
              guestMove: state.guestMove,
              winner: roundWinner,
            };
            state.round = currentRound + 1;
            state.hostMove = null;
            state.guestMove = null;

            const hostRow = db.prepare('SELECT username FROM users WHERE id = ?').get(room.host_user_id) as { username: string };
            const guestRow = db.prepare('SELECT username FROM users WHERE id = ?').get(room.guest_user_id) as { username: string };

            recordMatchForUser({
              userId: room.host_user_id,
              gameType: 'rps',
              mode: 'online',
              difficulty: 'online',
              opponentName: guestRow.username,
              result: roundWinner === 'host' ? 'win' : roundWinner === 'guest' ? 'loss' : 'draw',
              score: roundWinner === 'host' ? 120 : roundWinner === 'draw' ? 45 : 15,
            });
            recordMatchForUser({
              userId: room.guest_user_id,
              gameType: 'rps',
              mode: 'online',
              difficulty: 'online',
              opponentName: hostRow.username,
              result: roundWinner === 'guest' ? 'win' : roundWinner === 'host' ? 'loss' : 'draw',
              score: roundWinner === 'guest' ? 120 : roundWinner === 'draw' ? 45 : 15,
            });
          }

          db.prepare(
            `UPDATE multiplayer_rooms
             SET state_json = ?, host_score = ?, guest_score = ?, draws = ?, status = 'playing', updated_at = ?
             WHERE code = ?`
          ).run(JSON.stringify(state), hostScore, guestScore, draws, new Date().toISOString(), code);

          broadcastRoomState(code);
          return;
        }

        if (msg.type === 'room:rematch') {
          const code = String(payload.code || ws.roomCode || '').toUpperCase();
          const room = db.prepare('SELECT * FROM multiplayer_rooms WHERE code = ?').get(code) as
            | {
                code: string;
                game_type: 'rps' | 'ttt';
                host_user_id: string;
                guest_user_id: string | null;
                state_json: string;
              }
            | undefined;
          if (!room || (room.host_user_id !== user.id && room.guest_user_id !== user.id)) return;
          const prev = JSON.parse(room.state_json) as RoomState;
          const next = createInitialRoomState(room.game_type);
          next.chat = prev.chat || [];
          db.prepare(
            `UPDATE multiplayer_rooms SET state_json = ?, status = 'playing', updated_at = ? WHERE code = ?`
          ).run(JSON.stringify(next), new Date().toISOString(), code);
          broadcastRoomState(code);
          return;
        }

        if (msg.type === 'room:chat') {
          const code = String(payload.code || ws.roomCode || '').toUpperCase();
          const text = String(payload.text || '').trim().slice(0, 200);
          if (!text) return;
          const room = db.prepare('SELECT state_json FROM multiplayer_rooms WHERE code = ?').get(code) as
            | { state_json: string }
            | undefined;
          if (!room) return;
          const state = JSON.parse(room.state_json) as RoomState;
          const chat = state.chat || [];
          chat.push({
            id: crypto.randomUUID(),
            username: user.username,
            text,
            createdAt: new Date().toISOString(),
          });
          state.chat = chat.slice(-30);
          db.prepare(`UPDATE multiplayer_rooms SET state_json = ?, updated_at = ? WHERE code = ?`).run(
            JSON.stringify(state),
            new Date().toISOString(),
            code
          );
          broadcastRoomState(code);
        }
      } catch {
        // ignore malformed client socket messages
      }
    });

    ws.on('close', () => {
      if (ws.roomCode && roomClients.has(ws.roomCode)) {
        roomClients.get(ws.roomCode)!.delete(ws);
      }
      if (ws.userId && userSockets.has(ws.userId)) {
        userSockets.get(ws.userId)!.delete(ws);
      }
    });
  });

  return wss;
}
