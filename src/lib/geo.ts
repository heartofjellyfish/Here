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

/**
 * Read approximate [lat, lon] from edge headers. Vercel and Cloudflare
 * both expose city-granular geolocation at the edge — granular enough
 * that a Bay Area user's dot lands in the Bay Area, not in NYC or
 * "somewhere in the US."
 *
 * Returns null when no header is present (local dev, or deployments
 * without an IP-geo provider). Callers should fall back to a
 * country-level position in that case.
 *
 * We clamp to valid lat/lon ranges and reject non-numeric values rather
 * than trust whatever a proxy might send, since this coordinate is
 * rendered as a point on the globe.
 */
export function coordsFromRequest(
  req: NextRequest,
): [number, number] | null {
  const h = req.headers;
  const candidates: [string | null, string | null][] = [
    [h.get("x-vercel-ip-latitude"), h.get("x-vercel-ip-longitude")],
    [h.get("cf-iplatitude"), h.get("cf-iplongitude")],
  ];
  for (const [rawLat, rawLon] of candidates) {
    if (!rawLat || !rawLon) continue;
    const lat = parseFloat(rawLat);
    const lon = parseFloat(rawLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    return [lat, lon];
  }
  return null;
}
