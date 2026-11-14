import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Lightbulb, RotateCcw, Trophy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { UserProfile } from '../../types.ts';
import { apiFetch } from '../../utils/api.ts';
import { soundEngine } from '../../utils/sound.ts';

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

interface GuessConfig {
  label: string;
  max: number;
  maxAttempts: number;
  baseScore: number;
}

const DIFFICULTY_MAP: Record<Difficulty, GuessConfig> = {
  easy: { label: 'Easy (1–50)', max: 50, maxAttempts: 10, baseScore: 120 },
  medium: { label: 'Medium (1–100)', max: 100, maxAttempts: 8, baseScore: 180 },
  hard: { label: 'Hard (1–500)', max: 500, maxAttempts: 10, baseScore: 280 },
  expert: { label: 'Expert (1–1000)', max: 1000, maxAttempts: 10, baseScore: 420 },
};

interface GuessEntry {
  value: number;
  feedback: 'high' | 'low' | 'correct';
}

interface GuessTheNumberProps {
  onBack: () => void;
  onUserUpdated: (user: UserProfile, rewardBanner?: string) => void;
}

function generateSecret(max: number): number {
  return Math.floor(Math.random() * max) + 1;
}

export function GuessTheNumber({ onBack, onUserUpdated }: GuessTheNumberProps) {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const config = DIFFICULTY_MAP[difficulty];

  const [secret, setSecret] = useState<number>(() => generateSecret(DIFFICULTY_MAP.medium.max));
  const [guessInput, setGuessInput] = useState('');
  const [history, setHistory] = useState<GuessEntry[]>([]);
  const [lowBound, setLowBound] = useState(1);
  const [highBound, setHighBound] = useState(DIFFICULTY_MAP.medium.max);
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');
  const [hintsUsed, setHintsUsed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rewardNote, setRewardNote] = useState<string | null>(null);

  const startNewGame = (nextDiff: Difficulty = difficulty) => {
    soundEngine.playGameStart();
    const cfg = DIFFICULTY_MAP[nextDiff];
    setDifficulty(nextDiff);
    setSecret(generateSecret(cfg.max));
    setGuessInput('');
    setHistory([]);
    setLowBound(1);
    setHighBound(cfg.max);
    setStatus('playing');
    setHintsUsed([]);
    setError(null);
    setRewardNote(null);
  };

  const recordOutcome = async (result: 'win' | 'loss', attempts: number, finalScore: number) => {
    try {
      const data = await apiFetch<{
        xpEarned: number;
        coinsEarned: number;
        newlyUnlocked: string[];
        user: UserProfile;
      }>('/api/matches', {
        method: 'POST',
        body: JSON.stringify({
          gameType: 'guess',
          mode: 'ai',
          difficulty,
          opponentName: `Cipher Vault (1–${config.max})`,
          result,
          score: finalScore,
          details: { attempts, hintsUsed: hintsUsed.length, max: config.max },
        }),
      });
      setRewardNote(`+${data.xpEarned} XP · +${data.coinsEarned} Arena Coins`);
      onUserUpdated(data.user, data.newlyUnlocked.length ? 'New achievement unlocked!' : undefined);
    } catch {
      // ignore non-fatal network save
    }
  };

  const handleSubmitGuess = (e: FormEvent) => {
    e.preventDefault();
    if (status !== 'playing') return;
    setError(null);

    const parsed = Number(guessInput.trim());
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > config.max) {
      setError(`Please enter a whole number between 1 and ${config.max}.`);
      return;
    }

    if (history.some((h) => h.value === parsed)) {
      setError(`You already guessed ${parsed}. Try a different number.`);
      return;
    }

    const attemptsNow = history.length + 1;
    let feedback: 'high' | 'low' | 'correct';

    if (parsed === secret) {
      feedback = 'correct';
      const nextHistory: GuessEntry[] = [{ value: parsed, feedback }, ...history];
      setHistory(nextHistory);
      setStatus('won');
      setGuessInput('');
      soundEngine.playVictory();
      const bonus = Math.max(20, (config.maxAttempts - attemptsNow) * 25 - hintsUsed.length * 15);
      const score = config.baseScore + bonus;
      void recordOutcome('win', attemptsNow, score);
      return;
    }

    if (parsed > secret) {
      feedback = 'high';
      setHighBound((prev) => Math.min(prev, parsed - 1));
    } else {
      feedback = 'low';
      setLowBound((prev) => Math.max(prev, parsed + 1));
    }

    const nextHistory: GuessEntry[] = [{ value: parsed, feedback }, ...history];
    setHistory(nextHistory);
    setGuessInput('');

    if (attemptsNow >= config.maxAttempts) {
      setStatus('lost');
      soundEngine.playDefeat();
      void recordOutcome('loss', attemptsNow, 15);
    } else {
      soundEngine.playMove();
    }
  };

  const handleRevealHint = () => {
    if (status !== 'playing' || hintsUsed.length >= 3) return;
    soundEngine.playClick();
    const index = hintsUsed.length;
    let hintText = '';

    if (index === 0) {
      hintText = `Parity clue: The secret number is ${secret % 2 === 0 ? 'EVEN' : 'ODD'}.`;
    } else if (index === 1) {
      const lastDigit = secret % 10;
      hintText = `Digit clue: The number ends in ${lastDigit} (${secret % 5 === 0 ? 'divisible by 5' : 'not divisible by 5'}).`;
    } else {
      const span = Math.max(10, Math.round(config.max * 0.15));
      const minHint = Math.max(1, secret - Math.floor(span / 2));
      const maxHint = Math.min(config.max, minHint + span);
      hintText = `Range clue: Look closely between ${minHint} and ${maxHint}.`;
    }

    setHintsUsed((prev) => [...prev, hintText]);
  };

  const lastEntry = history[0] || null;
  const attemptsLeft = config.maxAttempts - history.length;

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
              Guess the Number
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Precision Cipher Vault · Directional Clues · 3-Tier Hint Engine
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => startNewGame(difficulty)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          New Game
        </button>
      </div>

      {/* Difficulty Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
          {(Object.keys(DIFFICULTY_MAP) as Difficulty[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => startNewGame(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                difficulty === d
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {DIFFICULTY_MAP[d].label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-5 text-sm tabular-nums">
          <div>
            <span className="text-slate-500 dark:text-slate-400 mr-1.5">Attempts:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {history.length}/{config.maxAttempts}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 mr-1.5">Active Range:</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {lowBound} – {highBound}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Input & Feedback */}
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
          {/* Clue Banner */}
          <div className="rounded-2xl p-5 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-center">
            {status === 'won' ? (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  <Trophy className="w-6 h-6" />
                  Correct! The secret number was {secret}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Solved in {history.length} {history.length === 1 ? 'attempt' : 'attempts'}.
                </p>
                {rewardNote && (
                  <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                    {rewardNote}
                  </p>
                )}
              </div>
            ) : status === 'lost' ? (
              <div className="space-y-2">
                <div className="font-display text-2xl font-bold text-rose-600 dark:text-rose-400">
                  Out of Attempts — Secret was {secret}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Start a new round to try again.
                </p>
              </div>
            ) : lastEntry ? (
              <div className="space-y-1">
                <div
                  className={`inline-flex items-center gap-2 font-display text-2xl font-bold ${
                    lastEntry.feedback === 'high'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {lastEntry.feedback === 'high' ? (
                    <>
                      <ArrowDown className="w-6 h-6" /> TOO HIGH
                    </>
                  ) : (
                    <>
                      <ArrowUp className="w-6 h-6" /> TOO LOW
                    </>
                  )}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {lastEntry.feedback === 'high'
                    ? `${lastEntry.value} is above the secret number. Try a lower value.`
                    : `${lastEntry.value} is below the secret number. Try a higher value.`}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  Vault Locked · Guess Between 1 and {config.max}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  You have {attemptsLeft} attempts to crack the secret number.
                </p>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmitGuess} className="flex flex-col sm:flex-row gap-3">
            <input
              type="number"
              min={1}
              max={config.max}
              disabled={status !== 'playing'}
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              placeholder={`Enter a number (1–${config.max})`}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={status !== 'playing'}
              className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              Submit Guess
            </button>
          </form>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Hints Section */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                Smart Hints ({3 - hintsUsed.length} remaining)
              </span>
              <button
                type="button"
                disabled={status !== 'playing' || hintsUsed.length >= 3}
                onClick={handleRevealHint}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 text-amber-700 dark:text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                Use Hint
              </button>
            </div>

            {hintsUsed.length > 0 && (
              <ul className="space-y-2">
                {hintsUsed.map((hint, idx) => (
                  <li
                    key={idx}
                    className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs sm:text-sm text-amber-900 dark:text-amber-200 flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    {hint}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Guess History Log */}
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white mb-4">
            Attempt Log
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              Your guesses and directional clues will appear here.
            </p>
          ) : (
            <div className="space-y-2 max-h-[380px] overflow-y-auto">
              {history.map((entry, idx) => (
                <div
                  key={entry.value}
                  className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-sm tabular-nums"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400">
                      #{history.length - idx}
                    </span>
                    <span className="font-mono font-bold text-base text-slate-900 dark:text-white">
                      {entry.value}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold ${
                      entry.feedback === 'correct'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : entry.feedback === 'high'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {entry.feedback === 'correct' && 'Exact Match'}
                    {entry.feedback === 'high' && (
                      <>
                        <ArrowDown className="w-3.5 h-3.5" /> Too High
                      </>
                    )}
                    {entry.feedback === 'low' && (
                      <>
                        <ArrowUp className="w-3.5 h-3.5" /> Too Low
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
