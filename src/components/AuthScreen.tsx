import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, KeyRound, Lock, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { GAME_ASSETS } from '../assets/gameAssets.ts';
import type { UserProfile } from '../types.ts';
import { apiFetch, setStoredToken } from '../utils/api.ts';
import { soundEngine } from '../utils/sound.ts';

type AuthTab = 'email' | 'register' | 'password' | 'recover';
type Step = 'input' | 'verify';

interface AuthScreenProps {
  onAuthenticated: (user: UserProfile) => void;
  pendingJoinCode?: string | null;
}

export function AuthScreen({ onAuthenticated, pendingJoinCode }: AuthScreenProps) {
  const [tab, setTab] = useState<AuthTab>('email');
  const [step, setStep] = useState<Step>('input');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [heroImgError, setHeroImgError] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const switchTab = (next: AuthTab) => {
    soundEngine.playClick();
    setTab(next);
    setStep('input');
    setCode('');
    setError(null);
    setInfoMessage(null);
  };

  const handleRequestCode = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (tab === 'register' && username.trim().length < 2) {
      setError('Please choose a player username (at least 2 characters).');
      return;
    }

    setLoading(true);
    try {
      const purpose = tab === 'recover' ? 'reset_password' : 'auth';
      const data = await apiFetch<{
        ok: boolean;
        message: string;
        deliveryMode: string;
      }>('/api/auth/request-code', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          username: username.trim() || undefined,
          purpose,
        }),
      });
      soundEngine.playGameStart();
      setStep('verify');
      setDeliveryMode(data.deliveryMode);
      setInfoMessage(data.message);
      setCooldown(25);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (tab === 'recover') {
        if (newPassword.length < 6) {
          throw new Error('New password must be at least 6 characters.');
        }
        const data = await apiFetch<{ ok: boolean; token: string; user: UserProfile }>(
          '/api/auth/reset-password',
          {
            method: 'POST',
            body: JSON.stringify({
              email: email.trim(),
              code: code.trim(),
              newPassword,
            }),
          }
        );
        setStoredToken(data.token);
        soundEngine.playVictory();
        onAuthenticated(data.user);
        return;
      }

      const data = await apiFetch<{ ok: boolean; token: string; user: UserProfile }>(
        '/api/auth/verify-code',
        {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim(),
            code: code.trim(),
            username: tab === 'register' ? username.trim() : undefined,
            password: tab === 'register' && password ? password : undefined,
          }),
        }
      );
      setStoredToken(data.token);
      soundEngine.playVictory();
      onAuthenticated(data.user);
    } catch (err) {
      soundEngine.playDefeat();
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ ok: boolean; token: string; user: UserProfile }>(
        '/api/auth/login-password',
        {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        }
      );
      setStoredToken(data.token);
      soundEngine.playVictory();
      onAuthenticated(data.user);
    } catch (err) {
      soundEngine.playDefeat();
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col justify-center">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          {/* Left Editorial Showcase */}
          <div className="lg:col-span-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-display font-bold text-xl tracking-tight">
                  G
                </div>
                <span className="font-display text-2xl font-bold tracking-tight">GAMEVERSE</span>
              </div>

              <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight [text-wrap:balance] mb-4">
                Three classic arenas. One competitive player hub.
              </h1>
              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl mb-6">
                Sign in with your email to play Rock Paper Scissors, Guess the Number, and Tic-Tac-Toe against adaptive AI or challenge friends in live online multiplayer.
              </p>

              {pendingJoinCode && (
                <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-800 dark:text-emerald-200">
                  Room invitation <span className="font-mono font-semibold">{pendingJoinCode}</span> is ready. Verify your email below to enter the match.
                </div>
              )}
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 aspect-[16/9]">
              {!heroImgError ? (
                <img
                  src={GAME_ASSETS.heroArenaBanner}
                  alt="GAMEVERSE competitive tabletop strategy arena"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 flex items-center justify-center p-8 text-slate-200">
                  <span className="font-display text-2xl font-semibold">GAMEVERSE Arena</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent flex flex-col justify-end p-5">
                <div className="text-xs font-medium text-emerald-300 mb-1">
                  Email Verified Access · Real-Time Multiplayer · Persistent Stats
                </div>
                <p className="text-sm text-slate-200 max-w-md">
                  Earn XP, unlock achievement badges, climb the global leaderboard, and share live game previews.
                </p>
              </div>
            </div>
          </div>

          {/* Right Authentication Card */}
          <div className="lg:col-span-6 flex items-center">
            <div className="w-full rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
              <div className="mb-6">
                <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-1">
                  {tab === 'register'
                    ? 'Create your player account'
                    : tab === 'password'
                    ? 'Sign in with password'
                    : tab === 'recover'
                    ? 'Recover your account'
                    : 'Sign in with Email'}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {step === 'verify'
                    ? `Enter the 6-digit verification code sent to ${email}.`
                    : 'Verify your email address to enter GAMEVERSE. No phone number required.'}
                </p>
              </div>

              {/* Mode Switcher */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900/80 mb-6">
                <button
                  type="button"
                  onClick={() => switchTab('email')}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    tab === 'email'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Email Code
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('register')}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    tab === 'register'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Create Account
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('password')}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    tab === 'password'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('recover')}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    tab === 'recover'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Recovery
                </button>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-700 dark:text-rose-300"
                >
                  {error}
                </div>
              )}

              {infoMessage && (
                <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-800 dark:text-emerald-200 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p>{infoMessage}</p>
                    {deliveryMode === 'ethereal' && (
                      <p className="text-xs opacity-80 mt-1">
                        Using SMTP test relay (set <code className="font-mono">SMTP_HOST</code> or{' '}
                        <code className="font-mono">RESEND_API_KEY</code> in environment secrets for direct inbox delivery).
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Password Login Form */}
              {tab === 'password' && (
                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <div>
                    <label htmlFor="auth-email-pw" className="block text-sm font-medium mb-1.5">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="auth-email-pw"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="auth-password-login" className="block text-sm font-medium mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="auth-password-login"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {loading ? 'Signing in...' : 'Sign In to GAMEVERSE'}
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => switchTab('recover')}
                      className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      Forgot your password? Recover via email code
                    </button>
                  </div>
                </form>
              )}

              {/* Step 1: Request Verification Code (Email Sign-In / Register / Recovery) */}
              {tab !== 'password' && step === 'input' && (
                <form onSubmit={handleRequestCode} className="space-y-4">
                  {tab === 'register' && (
                    <div>
                      <label htmlFor="auth-username" className="block text-sm font-medium mb-1.5">
                        Player username
                      </label>
                      <input
                        id="auth-username"
                        type="text"
                        required
                        minLength={2}
                        maxLength={28}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Choose your arena name"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="auth-email" className="block text-sm font-medium mb-1.5">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="auth-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="player@example.com"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {tab === 'register' && (
                    <div>
                      <label htmlFor="auth-reg-password" className="block text-sm font-medium mb-1.5">
                        Account password <span className="text-xs font-normal text-slate-500">(optional, min 6 chars)</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="auth-reg-password"
                          type="password"
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Set an optional password for quick sign-in"
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {loading ? 'Sending Verification Code...' : 'Continue'}
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      We will send a temporary 6-digit verification code to your email. Codes expire in 10 minutes and are never shared or exposed.
                    </span>
                  </div>
                </form>
              )}

              {/* Step 2: Enter 6-Digit Verification Code */}
              {tab !== 'password' && step === 'verify' && (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <div>
                    <label htmlFor="auth-code" className="block text-sm font-medium mb-1.5">
                      6-digit verification code
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="auth-code"
                        type="text"
                        inputMode="numeric"
                        pattern="\d{6}"
                        maxLength={6}
                        required
                        autoFocus
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-lg tracking-[0.35em] text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {tab === 'recover' && (
                    <div>
                      <label htmlFor="auth-new-password" className="block text-sm font-medium mb-1.5">
                        New password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="auth-new-password"
                          type="password"
                          required
                          minLength={6}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Minimum 6 characters"
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || code.length !== 6}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {loading
                      ? 'Verifying...'
                      : tab === 'recover'
                      ? 'Reset Password & Enter GAMEVERSE'
                      : 'Verify & Enter GAMEVERSE'}
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="flex items-center justify-between pt-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setStep('input');
                        setCode('');
                        setError(null);
                      }}
                      className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      Change email address
                    </button>

                    <button
                      type="button"
                      disabled={cooldown > 0 || loading}
                      onClick={() => handleRequestCode()}
                      className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
