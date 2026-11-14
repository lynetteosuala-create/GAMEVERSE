import { ArrowLeft, Bot, RotateCcw, Trophy, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { UserProfile } from '../../types.ts';
import { apiFetch } from '../../utils/api.ts';
import { soundEngine } from '../../utils/sound.ts';

type Cell = 'X' | 'O' | null;
type GameMode = 'ai' | 'local';
type Difficulty = 'easy' | 'medium' | 'hard';

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function evaluateBoard(board: Cell[]): { winner: 'X' | 'O' | 'draw' | null; line: number[] | null } {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every((c) => c !== null)) {
    return { winner: 'draw', line: null };
  }
  return { winner: null, line: null };
}

function minimax(board: Cell[], depth: number, isMax: boolean): number {
  const { winner } = evaluateBoard(board);
  if (winner === 'O') return 10 - depth;
  if (winner === 'X') return depth - 10;
  if (winner === 'draw') return 0;

  if (isMax) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = 'O';
        best = Math.max(best, minimax(board, depth + 1, false));
        board[i] = null;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = 'X';
        best = Math.min(best, minimax(board, depth + 1, true));
        board[i] = null;
      }
    }
    return best;
  }
}

function computeAiMove(board: Cell[], difficulty: Difficulty): number {
  const empty = board.map((c, idx) => (c === null ? idx : -1)).filter((idx) => idx !== -1);
  if (empty.length === 0) return -1;

  if (difficulty === 'easy') {
    return empty[Math.floor(Math.random() * empty.length)];
  }

  if (difficulty === 'medium') {
    // Win if possible, block X win if needed, else random
    for (const idx of empty) {
      const copy = [...board];
      copy[idx] = 'O';
      if (evaluateBoard(copy).winner === 'O') return idx;
    }
    for (const idx of empty) {
      const copy = [...board];
      copy[idx] = 'X';
      if (evaluateBoard(copy).winner === 'X') return idx;
    }
    return empty[Math.floor(Math.random() * empty.length)];
  }

  // Hard: optimal Minimax
  let bestScore = -Infinity;
  let bestMove = empty[0];
  for (const idx of empty) {
    const copy = [...board];
    copy[idx] = 'O';
    const score = minimax(copy, 0, false);
    if (score > bestScore) {
      bestScore = score;
      bestMove = idx;
    }
  }
  return bestMove;
}

interface TicTacToeProps {
  user: UserProfile;
  onBack: () => void;
  onUserUpdated: (user: UserProfile, rewardBanner?: string) => void;
  onOpenMultiplayer: (game: 'ttt') => void;
}

export function TicTacToe({
  user,
  onBack,
  onUserUpdated,
  onOpenMultiplayer,
}: TicTacToeProps) {
  const [mode, setMode] = useState<GameMode>('ai');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [playerTwoName, setPlayerTwoName] = useState('Player 2');
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<'X' | 'O'>('X');
  const [winner, setWinner] = useState<'X' | 'O' | 'draw' | null>(null);
  const [winningLine, setWinningLine] = useState<number[] | null>(null);
  const [aiThinking, setAiThinking] = useState(false);

  const [xWins, setXWins] = useState(0);
  const [oWins, setOWins] = useState(0);
  const [draws, setDraws] = useState(0);
  const [rewardNote, setRewardNote] = useState<string | null>(null);

  const recordOutcome = async (outcome: 'X' | 'O' | 'draw') => {
    const result = outcome === 'X' ? 'win' : outcome === 'O' ? 'loss' : 'draw';
    const score = result === 'win' ? (difficulty === 'hard' ? 180 : 120) : result === 'draw' ? 50 : 15;
    try {
      const data = await apiFetch<{
        xpEarned: number;
        coinsEarned: number;
        newlyUnlocked: string[];
        user: UserProfile;
      }>('/api/matches', {
        method: 'POST',
        body: JSON.stringify({
          gameType: 'ttt',
          mode,
          difficulty: mode === 'ai' ? difficulty : 'local',
          opponentName: mode === 'ai' ? `Minimax AI (${difficulty})` : playerTwoName || 'Player 2',
          result,
          score,
        }),
      });
      setRewardNote(`+${data.xpEarned} XP · +${data.coinsEarned} Arena Coins`);
      onUserUpdated(data.user, data.newlyUnlocked.length ? 'New achievement unlocked!' : undefined);
    } catch {
      // ignore non-fatal network save
    }
  };

  const finishRound = (outcome: 'X' | 'O' | 'draw', line: number[] | null) => {
    setWinner(outcome);
    setWinningLine(line);
    if (outcome === 'X') {
      setXWins((s) => s + 1);
      soundEngine.playVictory();
    } else if (outcome === 'O') {
      setOWins((s) => s + 1);
      if (mode === 'local') soundEngine.playVictory();
      else soundEngine.playDefeat();
    } else {
      setDraws((s) => s + 1);
      soundEngine.playDraw();
    }
    void recordOutcome(outcome);
  };

  useEffect(() => {
    if (mode !== 'ai' || turn !== 'O' || winner) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      setBoard((prev) => {
        const moveIdx = computeAiMove(prev, difficulty);
        if (moveIdx === -1) return prev;
        const next = [...prev];
        next[moveIdx] = 'O';
        const res = evaluateBoard(next);
        if (res.winner) {
          finishRound(res.winner, res.line);
        } else {
          soundEngine.playMove();
          setTurn('X');
        }
        return next;
      });
      setAiThinking(false);
    }, 420);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, turn, winner, difficulty]);

  const handleCellClick = (index: number) => {
    if (board[index] !== null || winner || aiThinking) return;
    if (mode === 'ai' && turn !== 'X') return;

    const next = [...board];
    next[index] = turn;
    setBoard(next);
    soundEngine.playMove();

    const res = evaluateBoard(next);
    if (res.winner) {
      finishRound(res.winner, res.line);
    } else {
      setTurn(turn === 'X' ? 'O' : 'X');
    }
  };

  const newRound = () => {
    soundEngine.playGameStart();
    setBoard(Array(9).fill(null));
    setTurn('X');
    setWinner(null);
    setWinningLine(null);
    setAiThinking(false);
    setRewardNote(null);
  };

  const resetAll = () => {
    newRound();
    setXWins(0);
    setOWins(0);
    setDraws(0);
  };

  const oLabel = mode === 'ai' ? `Computer (${difficulty})` : playerTwoName || 'Player 2';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              Tic-Tac-Toe
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Minimax Strategy AI · 2-Player Local Pass-and-Play · Live Online Grid
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenMultiplayer('ttt')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
        >
          <Users className="w-4 h-4" />
          Play Online Multiplayer
        </button>
      </div>

      {/* Mode & Difficulty Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setMode('ai');
                resetAll();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mode === 'ai'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              vs Computer
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setMode('local');
                resetAll();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mode === 'local'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              2-Player Local
            </button>
          </div>

          {mode === 'ai' ? (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setDifficulty(d);
                    newRound();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                    difficulty === d
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          ) : (
            <input
              type="text"
              value={playerTwoName}
              maxLength={20}
              onChange={(e) => setPlayerTwoName(e.target.value)}
              placeholder="Player O Name"
              className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-medium"
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={newRound}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            New Round
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            Reset Scores
          </button>
        </div>
      </div>

      {/* Score Strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 truncate">
            {user.username} (X)
          </div>
          <div className="font-mono text-3xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {xWins}
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Draws</div>
          <div className="font-mono text-3xl font-bold text-slate-700 dark:text-slate-300 tabular-nums">
            {draws}
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 inline-flex items-center gap-1 truncate max-w-full">
            {mode === 'ai' && <Bot className="w-3.5 h-3.5 shrink-0" />}
            {oLabel} (O)
          </div>
          <div className="font-mono text-3xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
            {oWins}
          </div>
        </div>
      </div>

      {/* Board Area */}
      <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 flex flex-col items-center">
        {/* Turn / Outcome Status */}
        <div className="mb-6 text-center min-h-[52px] flex flex-col items-center justify-center">
          {winner ? (
            <>
              <div className="inline-flex items-center gap-2 font-display text-2xl font-bold text-slate-900 dark:text-white">
                <Trophy className="w-6 h-6 text-emerald-500" />
                {winner === 'draw'
                  ? 'Match Draw'
                  : winner === 'X'
                  ? `${user.username} (X) Wins!`
                  : `${oLabel} (O) Wins!`}
              </div>
              {rewardNote && (
                <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                  {rewardNote}
                </div>
              )}
            </>
          ) : (
            <div className="font-display text-lg font-semibold text-slate-700 dark:text-slate-200">
              {aiThinking
                ? 'Computer is calculating next move...'
                : turn === 'X'
                ? `${user.username}'s Turn (X)`
                : `${oLabel}'s Turn (O)`}
            </div>
          )}
        </div>

        {/* 3x3 Grid */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[340px]">
          {board.map((cell, idx) => {
            const isWinCell = winningLine?.includes(idx) ?? false;
            return (
              <button
                key={idx}
                type="button"
                disabled={Boolean(cell) || Boolean(winner) || aiThinking}
                onClick={() => handleCellClick(idx)}
                aria-label={`Square ${idx + 1}${cell ? `, ${cell}` : ', empty'}`}
                className={`aspect-square rounded-2xl border text-4xl font-display font-bold flex items-center justify-center transition-all cursor-pointer ${
                  isWinCell
                    ? 'bg-emerald-500/20 border-emerald-500 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700 hover:border-emerald-500/60'
                }`}
              >
                {cell && (
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.16 }}
                    className={
                      cell === 'X'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-blue-600 dark:text-blue-400'
                    }
                  >
                    {cell}
                  </motion.span>
                )}
              </button>
            );
          })}
        </div>

        {winner && (
          <button
            type="button"
            onClick={newRound}
            className="mt-6 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            Play Again
          </button>
        )}
      </div>
    </div>
  );
}
