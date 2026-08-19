import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request) {
  const mem = process.memoryUsage();
  const rssOverhead = mem.rss - mem.heapTotal;
  return NextResponse.json({
    pid: process.pid,
    uptime_s: Math.round(process.uptime()),
    rss_mb: Math.round(mem.rss / 1024 / 1024),
    heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
    external_mb: Math.round(mem.external / 1024 / 1024),
    array_buffers_mb: Math.round(mem.arrayBuffers / 1024 / 1024),
    non_heap_mb: Math.round(rssOverhead / 1024 / 1024),
    node_options_max_old_space_mb: Number(
      (process.env.NODE_OPTIONS || "").match(/--max-old-space-size=(\d+)/)?.[1] ?? 0,
    ),
  });
}
