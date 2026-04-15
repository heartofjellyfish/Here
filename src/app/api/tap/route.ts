import { NextRequest, NextResponse } from "next/server";
import { recordTap } from "@/lib/db";
import { coordsFromRequest, countryFromRequest } from "@/lib/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const country = countryFromRequest(req);
  // City-granular coords when the edge provides them — so a Bay Area
  // user's home dot lands in the Bay Area, not on whatever metro our
  // weighted fallback happens to pick. Null in local dev or on
  // deployments without an IP-geo provider; the client falls back to
  // a country-level hotspot pick in that case.
  const coords = coordsFromRequest(req);
  const { recent5m, recentCountries } = recordTap(country);
  return NextResponse.json({
    ok: true,
    country,
    coords,
    recent5m,
    recentCountries,
  });
}
