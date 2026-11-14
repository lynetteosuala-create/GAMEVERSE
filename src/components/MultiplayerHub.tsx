import { Check, Copy, Link2, Plus, RotateCcw, Send, Shield, ScrollText, Scissors, Users, Wifi, WifiOff, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { InvitationItem, LinkPreviewData, RoomSummary, RoomView, UserProfile } from '../types.ts';
import { apiFetch, getStoredToken } from '../utils/api.ts';
import { soundEngine } from '../utils/sound.ts';
import { AvatarBadge } from './AvatarBadge.tsx';
import { PreviewCard } from './LinkPreviewTool.tsx';

interface MultiplayerHubProps {
  user: UserProfile;
  initialGame?: 'rps' | 'ttt';
  initialJoinCode?: string | null;
  onClearInitialJoin?: () => void;
  onRefreshUser: () => void;
}

export function MultiplayerHub({
  user,
  initialGame = 'ttt',
  initialJoinCode,
  onClearInitialJoin,
  onRefreshUser,
}: MultiplayerHubProps) {
  const [wsConnected, setWsConnected] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [activeRoom, setActiveRoom] = useState<RoomView | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState(initialJoinCode || '');
  const [inviteTarget, setInviteTarget] = useState('');
  const [chatText, setChatText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [roomPreview, setRoomPreview] = useState<LinkPreviewData | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const activeCodeRef = useRef<string | null>(null);

  const loadLobby = async () => {
    try {
      const data = await apiFetch<{ rooms: RoomSummary[]; invitations: InvitationItem[] }>('/api/rooms');
      setRooms(data.rooms);
      setInvitations(data.invitations);
    } catch {
      // ignore initial lobby errors
    }
  };

  useEffect(() => {
    loadLobby();
  }, []);

  useEffect(() => {
    let closedByUser = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      const token = getStoredToken();
      if (!token) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        if (activeCodeRef.current) {
          ws.send(JSON.stringify({ type: 'room:subscribe', payload: { code: activeCodeRef.current } }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; payload: unknown };
          if (msg.type === 'room:state') {
            const view = msg.payload as RoomView;
            setActiveRoom(view);
            onRefreshUser();
          } else if (msg.type === 'invite:received') {
            const inv = msg.payload as InvitationItem;
            soundEngine.playGameStart();
            setInvitations((prev) => [inv, ...prev.filter((i) => i.id !== inv.id)]);
            setNotice(`New match invitation from ${inv.fromUsername} (Room ${inv.roomCode})`);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!closedByUser) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };
    };

    connect();
    return () => {
      closedByUser = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialJoinCode) {
      void joinRoomByCode(initialJoinCode);
      onClearInitialJoin?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJoinCode]);

  const subscribeRoom = (code: string) => {
    activeCodeRef.current = code;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'room:subscribe', payload: { code } }));
    }
  };

  const createRoom = async (gameType: 'rps' | 'ttt') => {
    setError(null);
    setNotice(null);
    try {
      soundEngine.playGameStart();
      const data = await apiFetch<{ ok: boolean; room: RoomView }>('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ gameType }),
      });
      setActiveRoom(data.room);
      subscribeRoom(data.room.code);
      void loadLobby();
      void fetchSharePreview(data.room.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create room.');
    }
  };

  const joinRoomByCode = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;
    setError(null);
    setNotice(null);
    try {
      const data = await apiFetch<{ ok: boolean; room: RoomView }>(`/api/rooms/${code}/join`, {
        method: 'POST',
      });
      soundEngine.playGameStart();
      setActiveRoom(data.room);
      subscribeRoom(data.room.code);
      setJoinCodeInput('');
      void loadLobby();
      void fetchSharePreview(data.room.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join room.');
    }
  };

  const fetchSharePreview = async (code: string) => {
    try {
      const shareUrl = `${window.location.origin}/share/join-${code.toLowerCase()}`;
      const res = await apiFetch<{ ok: boolean; preview: LinkPreviewData }>(
        `/api/link-preview?url=${encodeURIComponent(shareUrl)}`
      );
      setRoomPreview(res.preview);
    } catch {
      setRoomPreview(null);
    }
  };

  const handleInvitePlayer = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeRoom || !inviteTarget.trim()) return;
    setError(null);
    setNotice(null);
    try {
      const data = await apiFetch<{ ok: boolean; invitedUsername: string }>('/api/invitations', {
        method: 'POST',
        body: JSON.stringify({ roomCode: activeRoom.code, target: inviteTarget.trim() }),
      });
      soundEngine.playVictory();
      setNotice(`Invitation sent to ${data.invitedUsername}!`);
      setInviteTarget('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send invitation.');
    }
  };

  const respondInvitation = async (id: string, action: 'accept' | 'decline', roomCode: string) => {
    try {
      await apiFetch(`/api/invitations/${id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setInvitations((prev) => prev.filter((i) => i.id !== id));
      if (action === 'accept') {
        await joinRoomByCode(roomCode);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to respond to invitation.');
    }
  };

  const sendSocket = (type: string, payload: Record<string, unknown>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Live connection is reconnecting. Please try again in a moment.');
      return;
    }
    wsRef.current.send(JSON.stringify({ type, payload }));
  };

  const copyInviteUrl = () => {
    if (!activeRoom) return;
    const url = `${window.location.origin}/?join=${activeRoom.code}`;
    navigator.clipboard?.writeText(url).catch(() => undefined);
    setCopied(true);
    soundEngine.playClick();
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
            Online Multiplayer Arena
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Real-time WebSocket rooms, player invitations, and synced match scoring.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
          {wsConnected ? (
            <>
              <Wifi className="w-4 h-4 text-emerald-500" />
              <span>WebSocket Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-amber-500" />
              <span>Connecting to server...</span>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-800 dark:text-emerald-200">
          {notice}
        </div>
      )}

      {/* Active Multiplayer Room View */}
      {activeRoom ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {activeRoom.gameType === 'ttt' ? 'Tic-Tac-Toe Online' : 'Rock Paper Scissors Online'} · Room{' '}
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {activeRoom.code}
                  </span>
                </div>
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                  {activeRoom.guest
                    ? `${activeRoom.host.username} vs ${activeRoom.guest.username}`
                    : 'Waiting for an opponent to join...'}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyInviteUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Invite Link Copied' : 'Copy Invite Link'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    activeCodeRef.current = null;
                    setActiveRoom(null);
                    setRoomPreview(null);
                    void loadLobby();
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Leave Room
                </button>
              </div>
            </div>

            {/* Live Scoreboard */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
                <AvatarBadge avatarUrl={activeRoom.host.avatarUrl} username={activeRoom.host.username} size="sm" />
                <div className="min-w-0">
                  <div className="text-xs text-slate-500 truncate">{activeRoom.host.username} (Host)</div>
                  <div className="font-mono text-xl font-bold tabular-nums">{activeRoom.host.score}</div>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-center">
                <div className="text-xs text-slate-500">Draws</div>
                <div className="font-mono text-xl font-bold tabular-nums">{activeRoom.draws}</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
                {activeRoom.guest ? (
                  <>
                    <AvatarBadge avatarUrl={activeRoom.guest.avatarUrl} username={activeRoom.guest.username} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500 truncate">{activeRoom.guest.username}</div>
                      <div className="font-mono text-xl font-bold tabular-nums">{activeRoom.guest.score}</div>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-400 w-full text-center">Open Seat</div>
                )}
              </div>
            </div>

            {/* Game Board: Online Tic-Tac-Toe */}
            {activeRoom.gameType === 'ttt' && activeRoom.state.board && (
              <div className="flex flex-col items-center space-y-5">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {!activeRoom.guest
                    ? 'Share the room code or invite a player on the right to begin.'
                    : activeRoom.state.winner
                    ? activeRoom.state.winner === 'draw'
                      ? 'Match ended in a Draw!'
                      : `${
                          activeRoom.state.winner === 'X'
                            ? activeRoom.host.username
                            : activeRoom.guest.username
                        } Wins!`
                    : `Current Turn: ${
                        activeRoom.state.turn === 'X'
                          ? `${activeRoom.host.username} (X)`
                          : `${activeRoom.guest.username} (O)`
                      }`}
                </div>

                <div className="grid grid-cols-3 gap-3 w-full max-w-[320px]">
                  {activeRoom.state.board.map((cell, idx) => {
                    const isWinCell = activeRoom.state.winningLine?.includes(idx) ?? false;
                    const mySymbol = activeRoom.role === 'host' ? 'X' : activeRoom.role === 'guest' ? 'O' : null;
                    const canPlay =
                      Boolean(activeRoom.guest) &&
                      !activeRoom.state.winner &&
                      cell === null &&
                      mySymbol === activeRoom.state.turn;

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={!canPlay}
                        onClick={() => {
                          soundEngine.playMove();
                          sendSocket('ttt:move', { code: activeRoom.code, index: idx });
                        }}
                        className={`aspect-square rounded-2xl border text-3xl font-display font-bold flex items-center justify-center transition-colors ${
                          isWinCell
                            ? 'bg-emerald-500/20 border-emerald-500'
                            : canPlay
                            ? 'bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer'
                            : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <span className={cell === 'X' ? 'text-rose-500' : 'text-blue-500'}>{cell}</span>
                      </button>
                    );
                  })}
                </div>

                {activeRoom.state.winner && (
                  <button
                    type="button"
                    onClick={() => sendSocket('room:rematch', { code: activeRoom.code })}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Play Rematch
                  </button>
                )}
              </div>
            )}

            {/* Game Board: Online Rock Paper Scissors */}
            {activeRoom.gameType === 'rps' && (
              <div className="space-y-6">
                {activeRoom.state.lastRound && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-center space-y-1">
                    <div className="text-xs text-slate-500">
                      Round {activeRoom.state.lastRound.round} Result
                    </div>
                    <div className="font-display text-lg font-bold text-slate-900 dark:text-white capitalize">
                      {activeRoom.host.username}: {activeRoom.state.lastRound.hostMove} vs{' '}
                      {activeRoom.guest?.username}: {activeRoom.state.lastRound.guestMove} —{' '}
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {activeRoom.state.lastRound.winner === 'draw'
                          ? 'Draw'
                          : activeRoom.state.lastRound.winner === 'host'
                          ? `${activeRoom.host.username} Wins`
                          : `${activeRoom.guest?.username} Wins`}
                      </span>
                    </div>
                  </div>
                )}

                <div className="text-center text-sm text-slate-600 dark:text-slate-300">
                  {!activeRoom.guest
                    ? 'Waiting for opponent to join before Round 1 begins.'
                    : (activeRoom.role === 'host' && activeRoom.state.hostMove) ||
                      (activeRoom.role === 'guest' && activeRoom.state.guestMove)
                    ? 'Your move is locked in! Waiting for opponent...'
                    : `Round ${activeRoom.state.round ?? 1}: Choose your move secretly`}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {(
                    [
                      { id: 'rock', label: 'Rock', Icon: Shield },
                      { id: 'paper', label: 'Paper', Icon: ScrollText },
                      { id: 'scissors', label: 'Scissors', Icon: Scissors },
                    ] as const
                  ).map(({ id, label, Icon }) => {
                    const alreadyLocked =
                      (activeRoom.role === 'host' && Boolean(activeRoom.state.hostMove)) ||
                      (activeRoom.role === 'guest' && Boolean(activeRoom.state.guestMove));
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={!activeRoom.guest || alreadyLocked}
                        onClick={() => {
                          soundEngine.playMove();
                          sendSocket('rps:move', { code: activeRoom.code, move: id });
                        }}
                        className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 hover:border-emerald-500 disabled:opacity-50 flex flex-col items-center gap-2 transition-colors cursor-pointer"
                      >
                        <Icon className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                        <span className="font-display font-semibold text-sm">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Invite Player + Share Link Preview + Room Chat */}
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Invite a Player
              </h3>
              <form onSubmit={handleInvitePlayer} className="space-y-2.5">
                <input
                  type="text"
                  value={inviteTarget}
                  onChange={(e) => setInviteTarget(e.target.value)}
                  placeholder="Player username or email"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm"
                />
                <button
                  type="submit"
                  className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Send Match Invitation
                </button>
              </form>

              {roomPreview && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" /> Shareable Match Link Preview
                  </div>
                  <PreviewCard preview={roomPreview} compact />
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Room Chat
              </h3>
              <div className="h-44 overflow-y-auto space-y-2 text-sm pr-1">
                {(activeRoom.state.chat || []).length === 0 ? (
                  <p className="text-xs text-slate-400">No messages yet.</p>
                ) : (
                  activeRoom.state.chat?.map((msg) => (
                    <div key={msg.id} className="text-xs">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {msg.username}:
                      </span>{' '}
                      <span className="text-slate-700 dark:text-slate-300">{msg.text}</span>
                    </div>
                  ))
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!chatText.trim()) return;
                  sendSocket('room:chat', { code: activeRoom.code, text: chatText });
                  setChatText('');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Say hello..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs"
                />
                <button
                  type="submit"
                  className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : (
        /* Lobby View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-6">
            {/* Create / Join Room */}
            <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Create or Join a Match Room
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => createRoom('ttt')}
                  className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                    initialGame === 'ttt'
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                  }`}
                >
                  <div className="flex items-center justify-between font-display font-bold text-base">
                    Tic-Tac-Toe Room
                    <Plus className="w-4 h-4 text-emerald-500" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Host a live 3x3 strategy duel
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => createRoom('rps')}
                  className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                    initialGame === 'rps'
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                  }`}
                >
                  <div className="flex items-center justify-between font-display font-bold text-base">
                    Rock Paper Scissors Room
                    <Plus className="w-4 h-4 text-emerald-500" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Host simultaneous blind rounds
                  </p>
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void joinRoomByCode(joinCodeInput);
                }}
                className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-slate-200 dark:border-slate-800"
              >
                <input
                  type="text"
                  maxLength={8}
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="Enter 6-character room code (e.g. A4F9B2)"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-sm uppercase"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:opacity-90 text-white text-sm font-semibold whitespace-nowrap cursor-pointer"
                >
                  Join Room
                </button>
              </form>
            </div>

            {/* Active Lobby Rooms */}
            <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Active Rooms
                </h2>
                <button
                  type="button"
                  onClick={loadLobby}
                  className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Refresh
                </button>
              </div>

              {rooms.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                  No open rooms right now. Create a room above and invite another player!
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {rooms.map((r) => (
                    <div key={r.code} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-sm text-slate-900 dark:text-white">
                          {r.gameType === 'ttt' ? 'Tic-Tac-Toe' : 'Rock Paper Scissors'} ·{' '}
                          <span className="font-mono">{r.code}</span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Host: {r.hostUsername} · {r.guestUsername ? `vs ${r.guestUsername}` : 'Waiting for opponent'}
                        </div>
                      </div>
                      {(r.hostId === user.id || r.guestId === user.id || !r.guestId) && (
                        <button
                          type="button"
                          onClick={() => joinRoomByCode(r.code)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                        >
                          {r.hostId === user.id || r.guestId === user.id ? 'Rejoin' : 'Join'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Incoming Invitations */}
          <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-500" />
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Match Invitations
              </h2>
            </div>

            {invitations.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                No pending invitations. Players can invite you by username or email ({user.email}).
              </p>
            ) : (
              <div className="space-y-3">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <AvatarBadge avatarUrl={inv.fromAvatar} username={inv.fromUsername} size="sm" />
                      <div>
                        <div className="text-sm font-semibold">
                          {inv.fromUsername} invited you
                        </div>
                        <div className="text-xs text-slate-500">
                          {inv.gameType === 'ttt' ? 'Tic-Tac-Toe' : 'Rock Paper Scissors'} · Room {inv.roomCode}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => respondInvitation(inv.id, 'accept', inv.roomCode)}
                        className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        Accept & Join
                      </button>
                      <button
                        type="button"
                        onClick={() => respondInvitation(inv.id, 'decline', inv.roomCode)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                        aria-label="Decline invitation"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
