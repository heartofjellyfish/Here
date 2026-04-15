import type { NextRequest } from "next/server";

/**
 * Read country (ISO-3166-1 alpha-2) from edge headers, with an
 * Accept-Language regional fallback so this still works in local dev
 * and on hosts without IP geolocation. The Accept-Language fallback is
 * a hint, not ground truth — `en-US` strongly suggests the US, but a
 * traveler could be anywhere. For our use (lighting up "your country"
 * on a globe) the hint is the right level of certainty.
 */
export function countryFromRequest(req: NextRequest): string | null {
  const h = req.headers;
  const candidates = [
    h.get("x-vercel-ip-country"),
    h.get("cf-ipcountry"),
    h.get("x-country-code"),
  ];
  for (const v of candidates) {
    if (!v) continue;
    const s = v.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(s)) return s;
  }
  // Fallback: extract region from Accept-Language tags like "en-US",
  // "zh-CN", "pt-BR". Skip tags without a region.
  const al = h.get("accept-language");
  if (al) {
    for (const part of al.split(",")) {
      const tag = part.trim().split(";")[0];
      const m = tag.match(/^[a-z]{2,3}-([a-zA-Z]{2})\b/i);
      if (m) return m[1].toUpperCase();
    }
  }
  return null;
}
