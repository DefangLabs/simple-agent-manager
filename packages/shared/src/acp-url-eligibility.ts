/** Browser navigation only. This function never fetches or follows redirects. */
export function eligibleAcpUrl(raw: string): { host: string } | null {
  return eligibleAcpUrlDepth(raw, 0);
}

function eligibleAcpUrlDepth(raw: string, depth: number): { host: string } | null {
  if (depth > 2) return null;
  if (raw.length === 0 || raw.length > 8192 || raw.trim() !== raw ||
      /[\u0000-\u001f\u007f\\]/u.test(raw) || /%(?![0-9a-f]{2})/iu.test(raw)) return null;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      (parsed.port && parsed.port !== '443') || parsed.hash || !parsed.hostname.includes('.')) return null;
  const host = parsed.hostname.toLowerCase();
  if (!/^[a-z0-9.-]+$/u.test(host) || host.includes('..') ||
      host.split('.').some((part) => !part || part.startsWith('-') || part.endsWith('-') || part.startsWith('xn--')) ||
      !/^[a-z]{2,}$/u.test(host.split('.').at(-1) ?? '') ||
      host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.endsWith('.internal')) return null;
  for (const [key, value] of parsed.searchParams) {
    if (/^(redirect|redirect_uri|redirect_url|callback|callback_uri|callback_url|return_to|return_url|return_uri|next|continue)$/iu.test(key)) {
      if (!eligibleAcpUrlDepth(value, depth + 1)) return null;
    }
  }
  return { host };
}
