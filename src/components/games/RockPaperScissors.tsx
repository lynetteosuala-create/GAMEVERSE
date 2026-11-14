import { ArrowLeft, Bot, RotateCcw, Scissors, ScrollText, Shield, Trophy, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import type { UserProfile } from '../../types.ts';
import { apiFetch } from '../../utils/api.ts';
import { soundEngine } from '../../utils/sound.ts';

type Choice = 'rock' | 'paper' | 'scissors';
type Difficulty = 'easy' | 'medium' | 'hard';
type SeriesMode = 'single' | 'best5';

interface RockPaperScissorsProps {
  user: UserProfile;
  onBack: () => void;
  onUserUpdated: (user: UserProfile, rewardBanner?: string) => void;
  onOpenMultiplayer: (game: 'rps') => void;
}

const CHOICES: Array<{ id: Choice; label: string; beats: Choice }> = [
  { id: 'rock', label: 'Rock', beats: 'scissors' },
  { id: 'paper', label: 'Paper', beats: 'rock' },
  { id: 'scissors', label: 'Scissors', beats: 'paper' },
];

function ChoiceIcon({ choice, className = 'w-8 h-8' }: { choice: Choice; className?: string }) {
  if (choice === 'rock') return <Shield className={className} />;
  if (choice === 'paper') return <ScrollText className={className} />;
  return <Scissors className={className} />;
}

function counterTo(move: Choice): Choice {
  if (move === 'rock') return 'paper';
  if (move === 'paper') return 'scissors';
  return 'rock';
}

export function RockPaperScissors({
  user,
  onBack,
  onUserUpdated,
  onOpenMultiplayer,
}: RockPaperScissorsProps) {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [seriesMode, setSeriesMode] = useState<SeriesMode>('best5');
  const [playerChoice, setPlayerChoice] = useState<Choice | null>(null);
  const [cpuChoice, setCpuChoice] = useState<Choice | null>(null);
  const [roundOutcome, setRoundOutcome] = useState<'win' | 'loss' | 'draw' | null>(null);
  const [animating, setAnimating] = useState(false);

  const [playerScore, setPlayerScore] = useState(0);
  const [cpuScore, setCpuScore] = useState(0);
  const [draws, setDraws] = useState(0);
  const [seriesWinner, setSeriesWinner] = useState<'player' | 'cpu' | null>(null);
  const [saving, setSaving] = useState(false);
  const [rewardNote, setRewardNote] = useState<string | null>(null);

  const historyRef = useRef<Choice[]>([]);

  const pickCpuMove = (diff: Difficulty): Choice => {
    const all: Choice[] = ['rock', 'paper', 'scissors'];
    const hist = historyRef.current;

    if (diff === 'easy' || hist.length === 0) {
      return all[Math.floor(Math.random() * 3)];
    }

    if (diff === 'medium') {
      // Frequency counter 55% of the time
      if (Math.random() < 0.55) {
        const counts: Record<Choice, number> = { rock: 0, paper: 0, scissors: 0 };
        for (const m of hist) counts[m] += 1;
        const mostCommon = (Object.keys(counts) as Choice[]).sort((a, b) => counts[b] - counts[a])[0];
        return counterTo(mostCommon);
      }
      return all[Math.floor(Math.random() * 3)];
    }

    // Hard: Markov transition predictor based on player's last move
    if (hist.length >= 2) {
      const lastMove = hist[hist.length - 1];
      const transitions: Record<Choice, number> = { rock: 0, paper: 0, scissors: 0 };
      for (let i = 0; i < hist.length - 1; i++) {
        if (hist[i] === lastMove) {
          transitions[hist[i + 1]] += 1;
        }
      }
      const total = transitions.rock + transitions.paper + transitions.scissors;
      if (total > 0 && Math.random() < 0.78) {
        const predicted = (Object.keys(transitions) as Choice[]).sort(
          (a, b) => transitions[b] - transitions[a]
        )[0];
        return counterTo(predicted);
      }
    }

    return counterTo(hist[hist.length - 1]);
  };

  const recordMatch = async (result: 'win' | 'loss' | 'draw', scoreValue: number) => {
    setSaving(true);
    try {
      const data = await apiFetch<{
        xpEarned: number;
        coinsEarned: number;
        newlyUnlocked: string[];
        user: UserProfile;
      }>('/api/matches', {
        method: 'POST',
        body: JSON.stringify({
          gameType: 'rps',
          mode: 'ai',
          difficulty,
          opponentName: `Arena AI (${difficulty})`,
          result,
          score: scoreValue,
        }),
      });
      const msg = `+${data.xpEarned} XP · +${data.coinsEarned} Arena Coins`;
      setRewardNote(msg);
      onUserUpdated(data.user, data.newlyUnlocked.length ? 'New achievement unlocked!' : undefined);
    } catch {
      // ignore non-fatal background save issue
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (choice: Choice) => {
    if (animating || seriesWinner) return;
    soundEngine.playMove();
    setAnimating(true);
    setRewardNote(null);
    setPlayerChoice(choice);
    setCpuChoice(null);
    setRoundOutcome(null);

    const cpu = pickCpuMove(difficulty);
    historyRef.current = [...historyRef.current.slice(-20), choice];

    window.setTimeout(() => {
      setCpuChoice(cpu);
      let outcome: 'win' | 'loss' | 'draw' = 'draw';
      if (choice !== cpu) {
        const rule = CHOICES.find((c) => c.id === choice);
        outcome = rule?.beats === cpu ? 'win' : 'loss';
      }
      setRoundOutcome(outcome);
      setAnimating(false);

      let nextP = playerScore;
      let nextC = cpuScore;
      if (outcome === 'win') {
        nextP += 1;
        setPlayerScore(nextP);
        soundEngine.playVictory();
      } else if (outcome === 'loss') {
        nextC += 1;
        setCpuScore(nextC);
        soundEngine.playDefeat();
      } else {
        setDraws((d) => d + 1);
        soundEngine.playDraw();
      }

      if (seriesMode === 'single') {
        void recordMatch(outcome, outcome === 'win' ? 100 : outcome === 'draw' ? 40 : 15);
      } else if (nextP >= 3 || nextC >= 3) {
        const winner = nextP >= 3 ? 'player' : 'cpu';
        setSeriesWinner(winner);
        void recordMatch(winner === 'player' ? 'win' : 'loss', nextP * 60);
      }
    }, 380);
  };

  const resetSeries = () => {
    soundEngine.playGameStart();
    setPlayerScore(0);
    setCpuScore(0);
    setDraws(0);
    setPlayerChoice(null);
    setCpuChoice(null);
    setRoundOutcome(null);
    setSeriesWinner(null);
    setRewardNote(null);
  };

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
              Rock Paper Scissors
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Adaptive AI Duel · Pattern Recognition · Real-Time Multiplayer Available
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenMultiplayer('rps')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
        >
          <Users className="w-4 h-4" />
          Play Online Multiplayer
        </button>
      </div>

      {/* Controls Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setDifficulty(d);
                  resetSeries();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  difficulty === d
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {d} AI
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setSeriesMode('best5');
                resetSeries();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                seriesMode === 'best5'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Best of 5
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setSeriesMode('single');
                resetSeries();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                seriesMode === 'single'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Single Round
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={resetSeries}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Replay / Reset
        </button>
      </div>

      {/* Scoreboard */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            {user.username}
          </div>
          <div className="font-mono text-3xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {playerScore}
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Draws</div>
          <div className="font-mono text-3xl font-bold text-slate-700 dark:text-slate-300 tabular-nums">
            {draws}
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 inline-flex items-center gap-1">
            <Bot className="w-3.5 h-3.5" /> Computer
          </div>
          <div className="font-mono text-3xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {cpuScore}
          </div>
        </div>
      </div>

      {/* Duel Stage */}
      <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-6 mb-8">
          <motion.div
            key={`p-${playerChoice}-${animating}`}
            initial={{ scale: 0.92, opacity: 0.7 }}
            animate={{ scale: animating ? [1, 1.06, 1] : 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 min-h-[156px]"
          >
            <span className="text-xs text-slate-500 dark:text-slate-400 mb-3">Your Selection</span>
            {playerChoice ? (
              <>
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
                  <ChoiceIcon choice={playerChoice} className="w-7 h-7" />
                </div>
                <span className="font-display font-semibold capitalize">{playerChoice}</span>
              </>
            ) : (
              <span className="text-sm text-slate-400">Choose a move below</span>
            )}
          </motion.div>

          <div className="flex flex-col items-center justify-center text-center min-h-[96px]">
            {animating ? (
              <div className="font-display text-lg font-semibold text-amber-500">Comparing moves...</div>
            ) : seriesWinner ? (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  <Trophy className="w-6 h-6" />
                  {seriesWinner === 'player' ? 'Series Victory!' : 'Computer Wins Series'}
                </div>
                {rewardNote && (
                  <div className="text-xs font-mono text-amber-600 dark:text-amber-400">
                    {rewardNote}
                  </div>
                )}
                <button
                  type="button"
                  onClick={resetSeries}
                  className="mt-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Play New Series
                </button>
              </div>
            ) : roundOutcome ? (
              <div className="space-y-1">
                <div
                  className={`font-display text-2xl font-bold ${
                    roundOutcome === 'win'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : roundOutcome === 'loss'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {roundOutcome === 'win'
                    ? 'You Win This Round'
                    : roundOutcome === 'loss'
                    ? 'Computer Wins Round'
                    : 'Round Draw'}
                </div>
                {rewardNote && (
                  <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                    {saving ? 'Saving...' : rewardNote}
                  </div>
                )}
              </div>
            ) : (
              <div className="font-display text-xl font-bold text-slate-400">VS</div>
            )}
          </div>

          <motion.div
            key={`c-${cpuChoice}-${animating}`}
            initial={{ scale: 0.92, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 min-h-[156px]"
          >
            <span className="text-xs text-slate-500 dark:text-slate-400 mb-3">Computer Move</span>
            {animating ? (
              <div className="text-sm font-medium text-slate-400">Thinking...</div>
            ) : cpuChoice ? (
              <>
                <div className="w-14 h-14 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-2">
                  <ChoiceIcon choice={cpuChoice} className="w-7 h-7" />
                </div>
                <span className="font-display font-semibold capitalize">{cpuChoice}</span>
              </>
            ) : (
              <span className="text-sm text-slate-400">Waiting for your move</span>
            )}
          </motion.div>
        </div>

        {/* Selection Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CHOICES.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={animating || Boolean(seriesWinner)}
              onClick={() => handleSelect(item.id)}
              className="group p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 hover:border-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50 transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-[0.98]"
            >
              <div className="w-11 h-11 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                <ChoiceIcon choice={item.id} className="w-6 h-6" />
              </div>
              <div className="text-left">
                <div className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {item.label}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                  Beats {item.beats}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
