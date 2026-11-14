import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import type { ActiveView, UserProfile } from '../types.ts';
import { soundEngine } from '../utils/sound.ts';

interface TopNavProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  user: UserProfile;
}

const NAV_ITEMS: Array<{ id: ActiveView; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'multiplayer', label: 'Multiplayer' },
  { id: 'link-preview', label: 'Link Preview' },
  { id: 'profile', label: 'Leaderboard' },
  { id: 'settings', label: 'Settings' },
];

export function TopNav({ activeView, onNavigate, user }: TopNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const go = (view: ActiveView) => {
    soundEngine.playClick();
    onNavigate(view);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0B1120]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => go('dashboard')}
          className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
        >
          GAMEVERSE
        </button>

        {/* Zone 2: 5 concise single-line text nav links */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
            const isActive =
              activeView === item.id ||
              (item.id === 'dashboard' && (activeView === 'rps' || activeView === 'guess' || activeView === 'ttt'));
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={`py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
                  isActive
                    ? 'border-emerald-600 dark:border-emerald-400 text-slate-900 dark:text-white'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => go('profile')}
            className="hidden sm:inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {user.username} · Lv {user.level}
          </button>

          <button
            type="button"
            aria-label="Toggle navigation menu"
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] px-4 py-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeView === item.id
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => go('profile')}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-emerald-600 dark:text-emerald-400 cursor-pointer"
          >
            Player Profile ({user.username})
          </button>
        </div>
      )}
    </header>
  );
}
