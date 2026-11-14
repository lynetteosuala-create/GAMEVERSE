import { Award, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AuthScreen } from './components/AuthScreen.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { GuessTheNumber } from './components/games/GuessTheNumber.tsx';
import { RockPaperScissors } from './components/games/RockPaperScissors.tsx';
import { TicTacToe } from './components/games/TicTacToe.tsx';
import { LinkPreviewTool } from './components/LinkPreviewTool.tsx';
import { MultiplayerHub } from './components/MultiplayerHub.tsx';
import { ProfileLeaderboard } from './components/ProfileLeaderboard.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { TopNav } from './components/TopNav.tsx';
import type {
  AchievementItem,
  ActiveView,
  LeaderboardEntry,
  MatchRecord,
  UserProfile,
} from './types.ts';
import { apiFetch, setStoredToken } from './utils/api.ts';
import { soundEngine } from './utils/sound.ts';

function getJoinCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('join');
  return code ? code.trim().toUpperCase() : null;
}

export default function App() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [multiplayerGame, setMultiplayerGame] = useState<'rps' | 'ttt'>('ttt');
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(() => getJoinCodeFromUrl());

  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const applyUserPreferences = useCallback((profile: UserProfile) => {
    const root = document.documentElement;
    if (profile.settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    if (!profile.settings.animationsEnabled) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
    soundEngine.configure({
      soundEnabled: profile.settings.soundEnabled,
      musicEnabled: profile.settings.musicEnabled,
    });
  }, []);

  const loadArenaData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [mRes, aRes, lRes] = await Promise.all([
        apiFetch<{ matches: MatchRecord[] }>('/api/matches'),
        apiFetch<{ achievements: AchievementItem[] }>('/api/achievements'),
        apiFetch<{ leaderboard: LeaderboardEntry[] }>('/api/leaderboard'),
      ]);
      setMatches(mRes.matches);
      setAchievements(aRes.achievements);
      setLeaderboard(lRes.leaderboard);
    } catch {
      // ignore partial data load failures
    } finally {
      setLoadingData(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await apiFetch<{ authenticated: boolean; user?: UserProfile }>('/api/auth/me');
      if (data.authenticated && data.user) {
        setUser(data.user);
        applyUserPreferences(data.user);
        void loadArenaData();
      }
    } catch {
      // ignore
    }
  }, [applyUserPreferences, loadArenaData]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiFetch<{ authenticated: boolean; user?: UserProfile }>('/api/auth/me');
        if (active && data.authenticated && data.user) {
          setUser(data.user);
          applyUserPreferences(data.user);
          void loadArenaData();
          if (pendingJoinCode) {
            setActiveView('multiplayer');
          }
        }
      } catch {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) setCheckingAuth(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAuthenticated = (authedUser: UserProfile) => {
    setUser(authedUser);
    applyUserPreferences(authedUser);
    void loadArenaData();
    if (pendingJoinCode) {
      setActiveView('multiplayer');
    } else {
      setActiveView('dashboard');
    }
  };

  const handleUserUpdated = (updated: UserProfile, rewardBanner?: string) => {
    setUser(updated);
    applyUserPreferences(updated);
    void loadArenaData();
    if (rewardBanner) {
      setToast(rewardBanner);
      window.setTimeout(() => setToast(null), 3500);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken(null);
    soundEngine.stopMusic();
    setUser(null);
    setMatches([]);
    setAchievements([]);
    setActiveView('dashboard');
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-300">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
          Loading GAMEVERSE...
        </div>
      </div>
    );
  }

  // MANDATORY FIRST SCREEN: Always show Email Sign-In before dashboard or games
  if (!user) {
    return <AuthScreen onAuthenticated={handleAuthenticated} pendingJoinCode={pendingJoinCode} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
      <TopNav activeView={activeView} onNavigate={setActiveView} user={user} />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl bg-emerald-600 text-white shadow-lg flex items-center gap-2 text-sm font-semibold">
          <Award className="w-4 h-4" />
          {toast}
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeView === 'dashboard' && (
          <Dashboard
            user={user}
            matches={matches}
            achievements={achievements}
            loadingData={loadingData}
            onLaunchGame={setActiveView}
          />
        )}

        {activeView === 'rps' && (
          <RockPaperScissors
            user={user}
            onBack={() => setActiveView('dashboard')}
            onUserUpdated={handleUserUpdated}
            onOpenMultiplayer={(g) => {
              setMultiplayerGame(g);
              setActiveView('multiplayer');
            }}
          />
        )}

        {activeView === 'guess' && (
          <GuessTheNumber
            onBack={() => setActiveView('dashboard')}
            onUserUpdated={handleUserUpdated}
          />
        )}

        {activeView === 'ttt' && (
          <TicTacToe
            user={user}
            onBack={() => setActiveView('dashboard')}
            onUserUpdated={handleUserUpdated}
            onOpenMultiplayer={(g) => {
              setMultiplayerGame(g);
              setActiveView('multiplayer');
            }}
          />
        )}

        {activeView === 'multiplayer' && (
          <MultiplayerHub
            user={user}
            initialGame={multiplayerGame}
            initialJoinCode={pendingJoinCode}
            onClearInitialJoin={() => {
              setPendingJoinCode(null);
              if (window.location.search.includes('join=')) {
                window.history.replaceState({}, '', '/');
              }
            }}
            onRefreshUser={refreshProfile}
          />
        )}

        {activeView === 'link-preview' && <LinkPreviewTool />}

        {activeView === 'profile' && (
          <ProfileLeaderboard
            user={user}
            leaderboard={leaderboard}
            achievements={achievements}
            matches={matches}
            onUserUpdated={(u) => handleUserUpdated(u)}
          />
        )}

        {activeView === 'settings' && (
          <SettingsView
            user={user}
            onUserUpdated={(u) => handleUserUpdated(u)}
            onLogout={handleLogout}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div>
            GAMEVERSE · Rock Paper Scissors, Guess the Number, and Tic-Tac-Toe
          </div>
          <div>
            Arena Coins are fictional progression rewards with no real-money value.
          </div>
        </div>
      </footer>
    </div>
  );
}
