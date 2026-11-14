import { Lock, LogOut, Moon, Music, Shield, Sparkles, Sun, Volume2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { UserProfile, UserSettings } from '../types.ts';
import { apiFetch } from '../utils/api.ts';
import { soundEngine } from '../utils/sound.ts';

interface SettingsViewProps {
  user: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
  onLogout: () => void;
}

export function SettingsView({ user, onUserUpdated, onLogout }: SettingsViewProps) {
  const [settings, setSettings] = useState<UserSettings>(user.settings);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  const updateSetting = async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    soundEngine.configure({
      soundEnabled: next.soundEnabled,
      musicEnabled: next.musicEnabled,
    });
    if (key === 'soundEnabled' && value === true) {
      soundEngine.playClick();
    }
    try {
      const data = await apiFetch<{ ok: boolean; user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ settings: next }),
      });
      onUserUpdated(data.user);
    } catch {
      // ignore background setting sync issue
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    setSavingPw(true);
    try {
      const data = await apiFetch<{ ok: boolean; user: UserProfile }>('/api/profile/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      soundEngine.playVictory();
      onUserUpdated(data.user);
      setCurrentPassword('');
      setNewPassword('');
      setStatusMsg('Account password updated.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
          Settings & Preferences
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Control sound effects, ambient music, light/dark appearance, animations, account security, and privacy.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Audio & Appearance */}
        <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Audio & Display
          </h2>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Volume2 className="w-5 h-5 text-emerald-500" />
              <div>
                <div className="text-sm font-semibold">Game Sound Effects</div>
                <div className="text-xs text-slate-500">Moves, clicks, victory & defeat chimes</div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.soundEnabled}
              onClick={() => updateSetting('soundEnabled', !settings.soundEnabled)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                settings.soundEnabled
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {settings.soundEnabled ? 'On' : 'Off'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Music className="w-5 h-5 text-blue-500" />
              <div>
                <div className="text-sm font-semibold">Background Music</div>
                <div className="text-xs text-slate-500">Gentle synthesized ambient lounge chords</div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.musicEnabled}
              onClick={() => updateSetting('musicEnabled', !settings.musicEnabled)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                settings.musicEnabled
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {settings.musicEnabled ? 'Playing' : 'Off'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {settings.theme === 'dark' ? (
                <Moon className="w-5 h-5 text-indigo-400" />
              ) : (
                <Sun className="w-5 h-5 text-amber-500" />
              )}
              <div>
                <div className="text-sm font-semibold">Theme Appearance</div>
                <div className="text-xs text-slate-500">Switch between Light and Dark mode</div>
              </div>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => updateSetting('theme', 'light')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  settings.theme === 'light'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Light
              </button>
              <button
                type="button"
                onClick={() => updateSetting('theme', 'dark')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  settings.theme === 'dark'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Dark
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <div>
                <div className="text-sm font-semibold">Smooth Animations</div>
                <div className="text-xs text-slate-500">Toggle UI motion and card transitions</div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.animationsEnabled}
              onClick={() => updateSetting('animationsEnabled', !settings.animationsEnabled)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                settings.animationsEnabled
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {settings.animationsEnabled ? 'Enabled' : 'Reduced'}
            </button>
          </div>
        </div>

        {/* Privacy & Account Security */}
        <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-500" />
            Privacy & Account
          </h2>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
            <div className="text-slate-500">Verified Email</div>
            <div className="font-mono font-semibold text-slate-900 dark:text-white">{user.email}</div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Public Leaderboard Profile</div>
              <div className="text-xs text-slate-500">Show your username and XP on global rankings</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.privacyPublicProfile}
              onClick={() => updateSetting('privacyPublicProfile', !settings.privacyPublicProfile)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                settings.privacyPublicProfile
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {settings.privacyPublicProfile ? 'Public' : 'Private'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Show Recent Activity</div>
              <div className="text-xs text-slate-500">Display recent matches on your profile</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.privacyShowActivity}
              onClick={() => updateSetting('privacyShowActivity', !settings.privacyShowActivity)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                settings.privacyShowActivity
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {settings.privacyShowActivity ? 'Visible' : 'Hidden'}
            </button>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                soundEngine.stopMusic();
                soundEngine.playClick();
                onLogout();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Log Out of GAMEVERSE
            </button>
          </div>
        </div>
      </div>

      {/* Optional Password Security Card */}
      <form
        onSubmit={handlePasswordSubmit}
        className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-emerald-500" />
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            {user.hasPassword ? 'Update Account Password' : 'Set an Account Password (Optional)'}
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Setting a password lets you sign in with either your password or a 6-digit email verification code.
        </p>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-700 dark:text-rose-300">
            {errorMsg}
          </div>
        )}
        {statusMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-700 dark:text-emerald-300">
            {statusMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {user.hasPassword && (
            <div>
              <label htmlFor="cur-pw" className="block text-xs font-medium mb-1">
                Current Password
              </label>
              <input
                id="cur-pw"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm"
              />
            </div>
          )}
          <div>
            <label htmlFor="new-pw" className="block text-xs font-medium mb-1">
              New Password (min 6 chars)
            </label>
            <input
              id="new-pw"
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={savingPw}
          className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:opacity-90 text-white text-xs font-semibold cursor-pointer"
        >
          {savingPw ? 'Saving...' : user.hasPassword ? 'Update Password' : 'Enable Password Login'}
        </button>
      </form>
    </div>
  );
}
