import { Award, CheckCircle2, Coins, Search, Trophy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { AchievementItem, LeaderboardEntry, MatchRecord, UserProfile } from '../types.ts';
import { apiFetch } from '../utils/api.ts';
import { soundEngine } from '../utils/sound.ts';
import { AVATAR_PRESETS, AvatarBadge } from './AvatarBadge.tsx';

interface ProfileLeaderboardProps {
  user: UserProfile;
  leaderboard: LeaderboardEntry[];
  achievements: AchievementItem[];
  matches: MatchRecord[];
  onUserUpdated: (user: UserProfile) => void;
}

export function ProfileLeaderboard({
  user,
  leaderboard,
  achievements,
  matches,
  onUserUpdated,
}: ProfileLeaderboardProps) {
  const [tab, setTab] = useState<'leaderboard' | 'profile' | 'achievements' | 'history'>('leaderboard');
  const [username, setUsername] = useState(user.username);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'rps' | 'guess' | 'ttt'>('all');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const data = await apiFetch<{ ok: boolean; user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ username, avatarUrl }),
      });
      soundEngine.playVictory();
      onUserUpdated(data.user);
      setFeedback('Player profile updated.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const filteredLeaderboard = leaderboard.filter((entry) =>
    entry.username.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const filteredMatches = matches.filter((m) =>
    historyFilter === 'all' ? true : m.gameType === historyFilter
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
            Player Profile & Global Standings
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Track your experience points, level milestones, fictional Arena Coins, and match records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
          {(
            [
              { id: 'leaderboard', label: 'Leaderboard' },
              { id: 'profile', label: 'My Profile' },
              { id: 'achievements', label: 'Achievements' },
              { id: 'history', label: 'Game History' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setTab(t.id);
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                tab === t.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard Tab */}
      {tab === 'leaderboard' && (
        <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              Global Arena Leaderboard
            </h2>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search player..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-2 font-medium">Rank</th>
                  <th className="py-3 px-2 font-medium">Player</th>
                  <th className="py-3 px-2 font-medium text-right">Level</th>
                  <th className="py-3 px-2 font-medium text-right">XP</th>
                  <th className="py-3 px-2 font-medium text-right">Wins</th>
                  <th className="py-3 px-2 font-medium text-right">Win Rate</th>
                  <th className="py-3 px-2 font-medium text-right">Coins (Fictional)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 tabular-nums">
                {filteredLeaderboard.map((entry) => (
                  <tr
                    key={entry.id}
                    className={
                      entry.isCurrentUser
                        ? 'bg-emerald-500/10 font-semibold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }
                  >
                    <td className="py-3 px-2 font-mono text-xs">#{entry.rank}</td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2.5">
                        <AvatarBadge avatarUrl={entry.avatarUrl} username={entry.username} size="sm" />
                        <span>
                          {entry.username}
                          {entry.isCurrentUser && (
                            <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">(You)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-right font-mono">{entry.level}</td>
                    <td className="py-3 px-2 text-right font-mono">{entry.xp}</td>
                    <td className="py-3 px-2 text-right font-mono">{entry.totalWins}</td>
                    <td className="py-3 px-2 text-right font-mono">{entry.winRate}%</td>
                    <td className="py-3 px-2 text-right font-mono text-amber-600 dark:text-amber-400">
                      {entry.coins}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Profile Editor Tab */}
      {tab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSaveProfile}
            className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 space-y-5"
          >
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Customize Profile
            </h2>

            {feedback && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-700 dark:text-emerald-300">
                {feedback}
              </div>
            )}

            <div>
              <label htmlFor="profile-username" className="block text-sm font-medium mb-1.5">
                Player Username
              </label>
              <input
                id="profile-username"
                type="text"
                required
                minLength={2}
                maxLength={28}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm"
              />
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Choose Avatar</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {AVATAR_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playClick();
                      setAvatarUrl(preset.id);
                    }}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-colors cursor-pointer ${
                      avatarUrl === preset.id
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <AvatarBadge avatarUrl={preset.id} username={username || user.username} size="md" />
                    <span className="text-[11px] font-medium text-center leading-tight">
                      {preset.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>

          <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Per-Game Statistics
            </h2>
            <div className="space-y-3 tabular-nums">
              {(
                [
                  { id: 'rps', name: 'Rock Paper Scissors' },
                  { id: 'guess', name: 'Guess the Number' },
                  { id: 'ttt', name: 'Tic-Tac-Toe' },
                ] as const
              ).map((g) => {
                const st = user.stats.perGame[g.id];
                return (
                  <div
                    key={g.id}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-sm">{g.name}</div>
                      <div className="text-xs text-slate-500">
                        {st.played} played · {st.wins} wins
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">High Score</div>
                      <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {st.highScore}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-500" />
                Fictional Arena Coins have no real-money value.
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{user.coins}</span>
            </div>
          </div>
        </div>
      )}

      {/* Achievements Tab */}
      {tab === 'achievements' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {achievements.map((ach) => (
            <div
              key={ach.key}
              className={`rounded-2xl p-5 border space-y-3 ${
                ach.unlocked
                  ? 'bg-white dark:bg-[#131C31] border-emerald-500/40'
                  : 'bg-slate-50 dark:bg-[#131C31]/60 border-slate-200 dark:border-slate-800 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    ach.unlocked
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {ach.unlocked ? <CheckCircle2 className="w-5 h-5" /> : <Award className="w-5 h-5" />}
                </div>
                <span className="text-xs font-mono text-amber-600 dark:text-amber-400">
                  +{ach.rewardCoins} coins
                </span>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{ach.category}</div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {ach.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{ach.description}</p>
              </div>
              <div className="text-[11px] font-mono text-slate-500">
                {ach.unlocked && ach.unlockedAt
                  ? `Unlocked ${new Date(ach.unlockedAt).toLocaleDateString()}`
                  : 'Locked'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Game History Tab */}
      {tab === 'history' && (
        <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Match History
            </h2>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'rps', label: 'RPS' },
                  { id: 'guess', label: 'Number' },
                  { id: 'ttt', label: 'Tic-Tac-Toe' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setHistoryFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    historyFilter === f.id
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredMatches.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No matches recorded in this category yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                    <th className="py-2.5 px-2">Game</th>
                    <th className="py-2.5 px-2">Mode</th>
                    <th className="py-2.5 px-2">Opponent</th>
                    <th className="py-2.5 px-2">Result</th>
                    <th className="py-2.5 px-2 text-right">Score</th>
                    <th className="py-2.5 px-2 text-right">Rewards</th>
                    <th className="py-2.5 px-2 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                  {filteredMatches.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 px-2 font-medium">
                        {m.gameType === 'rps'
                          ? 'Rock Paper Scissors'
                          : m.gameType === 'guess'
                          ? 'Guess the Number'
                          : 'Tic-Tac-Toe'}
                      </td>
                      <td className="py-2.5 px-2 text-xs uppercase text-slate-500">
                        {m.mode} · {m.difficulty}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 dark:text-slate-300">{m.opponentName}</td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`text-xs font-bold uppercase ${
                            m.result === 'win'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : m.result === 'loss'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {m.result}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono">{m.score}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs text-slate-500">
                        +{m.xpEarned} XP · +{m.coinsEarned}
                      </td>
                      <td className="py-2.5 px-2 text-right text-xs text-slate-500">
                        {new Date(m.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
