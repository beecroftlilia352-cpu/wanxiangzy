import { RetryableGenerationError } from "@/lib/api/generation-errors";

const CANONICAL_ASSET_PATH = /^\/api\/media-assets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i;
const INTERNAL_PAYLOAD_KEYS = new Set([
  "asyncTask",
  "generationBatchProgress",
  "moduleResults",
  "promptTrace",
  "partialFailure",
]);

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export function parseCanonicalMediaAssetId(value: unknown) {
  if (typeof value !== "string") return null;
  return CANONICAL_ASSET_PATH.exec(value.trim())?.[1]?.toLowerCase() || null;
}
export function collectGenerationInputMediaAssetIds(payload: unknown) {
  const ids: string[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown, key?: string) => {
    if (key && INTERNAL_PAYLOAD_KEYS.has(key)) return;
    const id = parseCanonicalMediaAssetId(value);
    if (id) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [entryKey, entry] of Object.entries(value as Record<string, unknown>)) {
      visit(entry, entryKey);
    }
  };
  visit(payload);
  return ids;
}

export async function attachGenerationMediaAssetReferences(input: {
  client: RpcClient;
  generationId: string;
  ownerUserId: string;
  assetIds: string[];
  role: "generation_input" | "generation_result";
}) {
  const uniqueAssetIds = [...new Set(input.assetIds.map((id) => id.toLowerCase()))];
  for (const [ordinal, assetId] of uniqueAssetIds.entries()) {
    let result: { data: unknown; error: unknown };
    try {
      result = await input.client.rpc("attach_media_asset_reference", {
        p_asset_id: assetId,
        p_owner_user_id: input.ownerUserId,
        p_subject_type: "generation",
        p_subject_id: input.generationId,
        p_asset_role: input.role,
        p_ordinal: ordinal,
      });
    } catch (cause) {
      throw new RetryableGenerationError("媒体资产引用服务暂时不可用", "MEDIA_REFERENCE_RPC_UNAVAILABLE", { cause });
    }
    if (result.error || typeof result.data !== "string") {
      throw new RetryableGenerationError("媒体资产引用提交失败", "MEDIA_REFERENCE_COMMIT_FAILED");
    }
  }
}
