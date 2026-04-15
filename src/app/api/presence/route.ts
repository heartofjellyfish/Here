import { NextResponse } from "next/server";
import { recentCount, recentCountries } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const window = 5 * 60 * 1000;
  return NextResponse.json({
    recent5m: recentCount(window),
    recentCountries: recentCountries(window),
  });
}
