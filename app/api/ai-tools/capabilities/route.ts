import { NextResponse } from "next/server";
import { AI_TOOL_CATALOG, AI_TOOL_SLUGS } from "@/lib/ai-tools/catalog";
import { getAiToolProviderStatus } from "@/lib/api/ai-tools/provider.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const providerOperationPolicy = process.env.AI_TOOLS_PROVIDER_OPERATIONS === undefined
    ? "default-deny"
    : "explicit-allowlist";
  const tools = AI_TOOL_SLUGS.map((slug) => {
    const providerStatus = getAiToolProviderStatus(slug);
    return {
      ...AI_TOOL_CATALOG[slug],
      available: providerStatus.available,
      execution_mode: providerStatus.execution_mode,
      provider_status: {
        configured: providerStatus.configured,
        mock: providerStatus.mock,
        reason: providerStatus.reason,
        message: providerStatus.message,
      },
    };
  });
  const executionModes = Array.from(new Set(tools.map((tool) => tool.execution_mode)));

  return NextResponse.json({
    ok: true,
    execution_mode: executionModes.length === 1 ? executionModes[0] : "mixed",
    enabled: tools.some((tool) => tool.available),
    configuration: {
      provider_operation_policy: providerOperationPolicy,
      live_prerequisites: ["aliyun-oss", "supabase-service-role", "published-image-model-provider"],
    },
    tools,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
