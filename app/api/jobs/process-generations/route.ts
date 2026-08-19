import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return retiredResponse();
}

export async function POST() {
  return retiredResponse();
}

function retiredResponse() {
  return NextResponse.json({
    ok: false,
    queueMode: "bullmq",
    error: "Legacy HTTP/PostgreSQL polling processor has been retired",
  }, { status: 410 });
}
