import { NextRequest, NextResponse } from "next/server";
import { lastroDbInfo, readLastroState, writeLastroState } from "@/lib/server/lastro-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = readLastroState();
  return NextResponse.json({ ok: true, state: state?.payload ?? null, updatedAt: state?.updatedAt ?? null, db: lastroDbInfo() });
}

export async function PUT(request: NextRequest) {
  const payload = await request.json();
  const result = writeLastroState(payload);
  return NextResponse.json({ ok: true, updatedAt: result.updatedAt, dbPath: result.dbPath });
}
