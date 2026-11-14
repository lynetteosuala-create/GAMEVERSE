import { ExternalLink, Globe, Link2, Loader2, Send, Share2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { LinkPreviewData, SharedLinkItem } from '../types.ts';
import { apiFetch } from '../utils/api.ts';
import { soundEngine } from '../utils/sound.ts';
import { AvatarBadge } from './AvatarBadge.tsx';

function detectFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  try {
    const parsed = new URL(match[0]);
    return parsed.href;
  } catch {
    return null;
  }
}

export function LinkPreviewTool() {
  const [inputText, setInputText] = useState('');
  const [note, setNote] = useState('');
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sharedFeed, setSharedFeed] = useState<SharedLinkItem[]>([]);
  const [posting, setPosting] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const quickShareLinks = [
    { label: 'Share GAMEVERSE Hub', url: `${origin}/share/arena` },
    { label: 'Share Rock Paper Scissors', url: `${origin}/share/rps` },
    { label: 'Share Guess the Number', url: `${origin}/share/guess` },
    { label: 'Share Tic-Tac-Toe', url: `${origin}/share/ttt` },
  ];

  const loadFeed = async () => {
    try {
      const data = await apiFetch<{ links: SharedLinkItem[] }>('/api/shared-links');
      setSharedFeed(data.links);
    } catch {
      // ignore initial feed error
    }
  };

  useEffect(() => {
    loadFeed();
  }, []);

  const fetchPreviewFor = async (urlToFetch: string) => {
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const data = await apiFetch<{ ok: boolean; preview: LinkPreviewData }>(
        `/api/link-preview?url=${encodeURIComponent(urlToFetch)}`
      );
      setPreview(data.preview);
    } catch (err) {
      setPreview(null);
      setPreviewError(err instanceof Error ? err.message : 'Unable to fetch link preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    const url = detectFirstUrl(inputText);
    setDetectedUrl(url);
    if (!url) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      fetchPreviewFor(url);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [inputText]);

  const handleSelectQuickLink = (url: string) => {
    soundEngine.playClick();
    setInputText(url);
  };

  const handleShareToFeed = async (e: FormEvent) => {
    e.preventDefault();
    if (!detectedUrl) return;
    setPosting(true);
    setPreviewError(null);
    try {
      const data = await apiFetch<{ ok: boolean; sharedLink: SharedLinkItem }>('/api/shared-links', {
        method: 'POST',
        body: JSON.stringify({ url: detectedUrl, note }),
      });
      soundEngine.playVictory();
      setSharedFeed((prev) => [data.sharedLink, ...prev]);
      setNote('');
      setInputText('');
      setPreview(null);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Could not share link.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Link Preview & Game Sharing
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl">
          Paste any website or GAMEVERSE match link below. Our server detects valid URLs and retrieves genuine title, preview image, and description metadata—with automatic fallback handling if a site restricts metadata access.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: URL Input + Live Preview Inspector */}
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              Quick Share GAMEVERSE Links
            </div>
            <div className="flex flex-wrap gap-2">
              {quickShareLinks.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleSelectQuickLink(item.url)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:text-emerald-300 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleShareToFeed} className="space-y-4">
            <div>
              <label htmlFor="preview-url-input" className="block text-sm font-medium mb-1.5">
                URL or message containing a link
              </label>
              <div className="relative">
                <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="preview-url-input"
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="https://en.wikipedia.org/wiki/Rock_paper_scissors"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {detectedUrl && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5 truncate">
                  Detected URL: {detectedUrl}
                </p>
              )}
            </div>

            {previewError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-700 dark:text-rose-300">
                {previewError}
              </div>
            )}

            {/* Loading State */}
            {loadingPreview && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                Fetching live metadata from destination...
              </div>
            )}

            {/* Live Clickable Preview Card */}
            {!loadingPreview && preview && <PreviewCard preview={preview} />}

            <div>
              <label htmlFor="share-note-input" className="block text-sm font-medium mb-1.5">
                Optional message for the community board
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="share-note-input"
                  type="text"
                  maxLength={180}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Challenge players or share a game link..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!detectedUrl || posting}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  {posting ? 'Posting...' : 'Share Link'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Right: Community Shared Links Feed */}
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Shared Link Feed
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {sharedFeed.length} shared
            </span>
          </div>

          {sharedFeed.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No links shared yet. Share a GAMEVERSE challenge or external link to see its live preview card here.
            </div>
          ) : (
            <div className="space-y-4 max-h-[540px] overflow-y-auto pr-1">
              {sharedFeed.map((item) => (
                <div
                  key={item.id}
                  className="pb-4 border-b border-slate-200 dark:border-slate-800 last:border-b-0 last:pb-0 space-y-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <AvatarBadge avatarUrl={item.avatarUrl} username={item.username} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {item.username}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {item.note && (
                    <p className="text-sm text-slate-700 dark:text-slate-300">{item.note}</p>
                  )}
                  <PreviewCard
                    preview={{
                      url: item.url,
                      finalUrl: item.url,
                      title: item.title,
                      description: item.description,
                      image: item.imageUrl,
                      siteName: item.siteName || 'Link',
                      favicon: null,
                      fallback: false,
                    }}
                    compact
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PreviewCard({ preview, compact = false }: { preview: LinkPreviewData; compact?: boolean }) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <a
      href={preview.finalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 hover:border-emerald-500/60 transition-colors group"
    >
      <div className={`grid grid-cols-1 ${preview.image && !imgErr && !compact ? 'sm:grid-cols-12' : ''}`}>
        {preview.image && !imgErr && (
          <div
            className={
              compact
                ? 'h-36 w-full bg-slate-200 dark:bg-slate-800 overflow-hidden'
                : 'sm:col-span-4 h-40 sm:h-full bg-slate-200 dark:bg-slate-800 overflow-hidden'
            }
          >
            <img
              src={preview.image}
              alt={preview.title}
              referrerPolicy="no-referrer"
              onError={() => setImgErr(true)}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
            />
          </div>
        )}
        <div className={`${preview.image && !imgErr && !compact ? 'sm:col-span-8' : ''} p-4 flex flex-col justify-between gap-2`}>
          <div>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span className="inline-flex items-center gap-1.5 truncate">
                <Globe className="w-3.5 h-3.5 shrink-0" />
                {preview.siteName}
                {preview.fallback && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-600 dark:text-amber-400">Fallback preview</span>
                  </>
                )}
              </span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
            </div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white line-clamp-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              {preview.title}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mt-1">
              {preview.description}
            </p>
          </div>
          <div className="text-xs font-mono text-slate-500 dark:text-slate-500 truncate pt-1">
            {preview.finalUrl}
          </div>
        </div>
      </div>
    </a>
  );
}
