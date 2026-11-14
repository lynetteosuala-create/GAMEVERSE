import { Award, CheckCircle2, Coins, Flame, Link2, Play, Trophy, Users } from 'lucide-react';
import { useState } from 'react';
import { GAME_ASSETS } from '../assets/gameAssets.ts';
import type { AchievementItem, ActiveView, MatchRecord, UserProfile } from '../types.ts';
import { soundEngine } from '../utils/sound.ts';
import { AvatarBadge } from './AvatarBadge.tsx';

interface DashboardProps {
  user: UserProfile;
  matches: MatchRecord[];
  achievements: AchievementItem[];
  loadingData: boolean;
  onLaunchGame: (view: ActiveView) => void;
}

const GAME_CARDS = [
  {
    id: 'rps' as const,
    title: 'Rock Paper Scissors',
    meta: 'Adaptive AI · Best of 5 · Online PvP',
    description:
      'Outsmart an adaptive pattern-predicting opponent or lock in simultaneous rounds online.',
    image: GAME_ASSETS.rpsGameArt,
  },
  {
    id: 'guess' as const,
    title: 'Guess the Number',
    meta: '4 Difficulty Tiers · Smart Hints · Attempt Log',
    description:
      'Crack the secret cipher between 1 and 1,000 using directional clues and 3-tier logic hints.',
    image: GAME_ASSETS.numberGameArt,
  },
  {
    id: 'ttt' as const,
    title: 'Tic-Tac-Toe',
    meta: 'Minimax AI · 2-Player Local · Online Grid',
    description:
      'Challenge an unbeatable Minimax strategist, pass-and-play locally, or duel friends online.',
    image: GAME_ASSETS.tictactoeGameArt,
  },
];

function formatGameLabel(type: string) {
  if (type === 'rps') return 'Rock Paper Scissors';
  if (type === 'guess') return 'Guess the Number';
  return 'Tic-Tac-Toe';
}

export function Dashboard({
  user,
  matches,
  achievements,
  loadingData,
  onLaunchGame,
}: DashboardProps) {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const levelSpan = Math.max(1, user.nextLevelXp - user.currentLevelXp);
  const levelProgress = Math.min(
    100,
    Math.max(0, Math.round(((user.xp - user.currentLevelXp) / levelSpan) * 100))
  );
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="space-y-8">
      {/* Welcome & Player Progress Header */}
      <section className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <AvatarBadge avatarUrl={user.avatarUrl} username={user.username} size="lg" />
            <div>
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">
                Verified Player · Level {user.level}
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white [text-wrap:balance]">
                Welcome back, {user.username}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Select an arena below to earn XP, unlock achievements, and collect fictional Arena Coins.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                onLaunchGame('multiplayer');
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              <Users className="w-4 h-4" />
              Online Multiplayer
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                onLaunchGame('link-preview');
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              <Link2 className="w-4 h-4" />
              Link Preview
            </button>
          </div>
        </div>

        {/* XP Progress & Fictional Coins Bar */}
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-7 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-slate-600 dark:text-slate-300">
                Level {user.level} Progress
              </span>
              <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {user.xp} / {user.nextLevelXp} XP
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
                style={{ width: `${levelProgress}%` }}
              />
            </div>
          </div>

          <div className="md:col-span-5 flex flex-wrap items-center md:justify-end gap-6 text-sm tabular-nums">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-500" />
              <div>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {user.coins}
                </span>{' '}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Arena Coins (fictional)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-rose-500" />
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {user.currentStreak}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">streak</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Total Victories
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {user.stats.totalWins}
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Games Played
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {user.stats.totalGames}
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Highest Score
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {user.stats.highestScore}
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Win Rate
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {user.stats.winRate}%
          </div>
        </div>
      </section>

      {/* Available Games Grid */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Available Games
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            3 classic arenas ready to play
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {GAME_CARDS.map((card) => {
            const gameStats = user.stats.perGame[card.id];
            return (
              <article
                key={card.id}
                className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between group"
              >
                <div>
                  <div className="aspect-[4/3] bg-slate-900 overflow-hidden">
                    {!failedImages[card.id] ? (
                      <img
                        src={card.image}
                        alt={card.title}
                        referrerPolicy="no-referrer"
                        onError={() => setFailedImages((p) => ({ ...p, [card.id]: true }))}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-slate-800 to-emerald-950 flex items-center justify-center p-6 text-white font-display text-xl font-bold">
                        {card.title}
                      </div>
                    )}
                  </div>

                  <div className="p-6 space-y-2.5">
                    <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                      {card.title}
                    </h3>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{card.meta}</div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {card.description}
                    </p>
                  </div>
                </div>

                <div className="px-6 pb-6 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {gameStats.wins}
                    </span>{' '}
                    wins · Best{' '}
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {gameStats.highScore}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playGameStart();
                      onLaunchGame(card.id);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Play Now
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Recent Activity & Achievements */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Recent Gaming Activity */}
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Recent Gaming Activity
            </h2>
            <button
              type="button"
              onClick={() => onLaunchGame('profile')}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              View full history
            </button>
          </div>

          {loadingData ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800/60 animate-pulse"
                />
              ))}
            </div>
          ) : matches.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No matches played yet. Launch any game above to log your first victory.
              </p>
              <button
                type="button"
                onClick={() => onLaunchGame('rps')}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
              >
                Play First Match
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {matches.slice(0, 6).map((m) => (
                <div key={m.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">
                      {formatGameLabel(m.gameType)}{' '}
                      <span className="font-normal text-slate-500 dark:text-slate-400">
                        vs {m.opponentName}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {m.mode.toUpperCase()} · {new Date(m.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <div
                      className={`text-xs font-bold uppercase ${
                        m.result === 'win'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : m.result === 'loss'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {m.result}
                    </div>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      +{m.xpEarned} XP · +{m.coinsEarned} coins
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Achievements Preview */}
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Achievements
            </h2>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {unlockedCount}/{achievements.length} unlocked
            </span>
          </div>

          <div className="space-y-3">
            {achievements.slice(0, 5).map((ach) => (
              <div
                key={ach.key}
                className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  ach.unlocked
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-75'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    ach.unlocked
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {ach.unlocked ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Award className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {ach.title}
                    </span>
                    <span className="text-xs font-mono text-amber-600 dark:text-amber-400 shrink-0">
                      +{ach.rewardCoins}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {ach.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onLaunchGame('profile')}
            className="mt-4 w-full py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-500" />
            View All Achievements & Leaderboard
          </button>
        </div>
      </section>
    </div>
  );
}
