import net from 'node:net';

export interface LinkPreviewResult {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
  favicon: string | null;
  fallback: boolean;
  fallbackReason?: string;
}

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(input: string): string {
  return input
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39|#x27);/gi, (m) => ENTITY_MAP[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/\s+/g, ' ')
    .trim();
}

function isBlockedHostname(hostname: string, allowOriginHost?: string): boolean {
  const lower = hostname.toLowerCase();
  if (allowOriginHost && lower === allowOriginHost.toLowerCase()) {
    return false;
  }
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) {
    return true;
  }
  const ipType = net.isIP(lower);
  if (ipType === 4) {
    const parts = lower.split('.').map(Number);
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
  }
  if (ipType === 6) {
    if (lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) {
      return true;
    }
  }
  return false;
}

function extractMetaTag(html: string, keys: string[]): string | null {
  const metaRegex = /<meta\s+[^>]*>/gi;
  const tags = html.match(metaRegex) || [];
  for (const tag of tags) {
    const propertyMatch = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i);
    if (!propertyMatch) continue;
    const key = propertyMatch[1].toLowerCase().trim();
    if (!keys.includes(key)) continue;
    const contentMatch = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (contentMatch) {
      const value = (contentMatch[1] ?? contentMatch[2] ?? '').trim();
      if (value) return decodeEntities(value);
    }
  }
  return null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const decoded = decodeEntities(match[1]);
  return decoded || null;
}

function extractFavicon(html: string, baseUrl: string): string | null {
  const linkRegex = /<link\s+[^>]*>/gi;
  const tags = html.match(linkRegex) || [];
  for (const tag of tags) {
    const relMatch = tag.match(/rel\s*=\s*["']([^"']+)["']/i);
    if (!relMatch) continue;
    const rel = relMatch[1].toLowerCase();
    if (!rel.includes('icon')) continue;
    const hrefMatch = tag.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (hrefMatch) {
      const rawHref = (hrefMatch[1] ?? hrefMatch[2] ?? '').trim();
      if (rawHref) {
        try {
          return new URL(rawHref, baseUrl).href;
        } catch {
          return null;
        }
      }
    }
  }
  try {
    return new URL('/favicon.ico', baseUrl).href;
  } catch {
    return null;
  }
}

export async function fetchLinkPreview(rawUrl: string, selfOrigin?: string): Promise<LinkPreviewResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Please enter a valid URL starting with http:// or https://');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// links are supported.');
  }

  const selfHost = selfOrigin ? new URL(selfOrigin).hostname : undefined;
  if (isBlockedHostname(parsed.hostname, selfHost)) {
    return {
      url: parsed.href,
      finalUrl: parsed.href,
      title: parsed.hostname,
      description: 'Private or local network addresses cannot be fetched for security reasons.',
      image: null,
      siteName: parsed.hostname,
      favicon: null,
      fallback: true,
      fallbackReason: 'Restricted network host',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(parsed.href, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GameverseLinkPreview/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return {
        url: parsed.href,
        finalUrl: response.url || parsed.href,
        title: parsed.hostname,
        description: `Destination returned HTTP ${response.status}. Preview metadata could not be retrieved.`,
        image: null,
        siteName: parsed.hostname,
        favicon: null,
        fallback: true,
        fallbackReason: `HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        url: parsed.href,
        finalUrl: response.url || parsed.href,
        title: parsed.pathname.split('/').pop() || parsed.hostname,
        description: `Direct resource (${contentType || 'file'}) hosted on ${parsed.hostname}.`,
        image: contentType.startsWith('image/') ? response.url || parsed.href : null,
        siteName: parsed.hostname,
        favicon: null,
        fallback: !contentType.startsWith('image/'),
        fallbackReason: contentType.startsWith('image/') ? undefined : 'Non-HTML destination',
      };
    }

    const reader = response.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder();
      let received = 0;
      while (received < 512 * 1024) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (html.includes('</head>')) break;
      }
      await reader.cancel().catch(() => undefined);
    } else {
      html = (await response.text()).slice(0, 512 * 1024);
    }

    const finalUrl = response.url || parsed.href;
    const title =
      extractMetaTag(html, ['og:title', 'twitter:title']) ||
      extractTitle(html) ||
      parsed.hostname;
    const description =
      extractMetaTag(html, ['og:description', 'twitter:description', 'description']) ||
      `Visit ${parsed.hostname} to view the full page.`;
    const rawImage = extractMetaTag(html, ['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']);
    let image: string | null = null;
    if (rawImage) {
      try {
        image = new URL(rawImage, finalUrl).href;
      } catch {
        image = null;
      }
    }
    const siteName = extractMetaTag(html, ['og:site_name']) || parsed.hostname.replace(/^www\./, '');
    const favicon = extractFavicon(html, finalUrl);

    return {
      url: parsed.href,
      finalUrl,
      title,
      description,
      image,
      siteName,
      favicon,
      fallback: false,
    };
  } catch (err) {
    const message = err instanceof Error && err.name === 'AbortError'
      ? 'Request timed out while fetching metadata'
      : 'Metadata could not be retrieved from this destination';
    return {
      url: parsed.href,
      finalUrl: parsed.href,
      title: parsed.hostname,
      description: `${message}. You can still open the destination link directly.`,
      image: null,
      siteName: parsed.hostname.replace(/^www\./, ''),
      favicon: null,
      fallback: true,
      fallbackReason: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
