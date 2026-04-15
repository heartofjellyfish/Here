import { NextRequest, NextResponse } from "next/server";
import { recordTap } from "@/lib/db";
import { countryFromRequest } from "@/lib/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const country = countryFromRequest(req);
  const { recent5m, recentCountries } = recordTap(country);
  return NextResponse.json({
    ok: true,
    country,
    recent5m,
    recentCountries,
  });
}
