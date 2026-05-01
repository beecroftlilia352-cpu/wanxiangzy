/**
 * FASHN AI — Virtual Try-On API
 * https://fashn.ai
 *
 * 业内最佳虚拟换装 API (2026 年)，tryon-max 模型质量最高。
 * 输入：服装图 + 人物图 → 输出：人物穿着该服装的图片
 */

const FASHN_BASE = "https://api.fashn.ai/v1";

interface TryOnRequest {
  model_image_url: string;  // 人物图（参考图的姿势）
  garment_image_url: string; // 服装图
  category?: "upper_body" | "lower_body" | "dresses";
  mode?: "quality" | "balanced" | "speed";
}

interface TryOnResponse {
  id: string;
  status: "completed" | "failed" | "processing";
  output_url?: string;
  error?: string;
}

export async function startTryOn(params: TryOnRequest): Promise<{ id: string }> {
  const res = await fetch(`${FASHN_BASE}/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FASHN_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tryon-max",
      input: {
        model_image: params.model_image_url,
        garment_image: params.garment_image_url,
        category: params.category || "upper_body",
        mode: params.mode || "quality",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`FASHN API error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return { id: data.id };
}

export async function pollTryOnResult(predictionId: string): Promise<TryOnResponse> {
  const res = await fetch(`${FASHN_BASE}/run/${predictionId}`, {
    headers: {
      Authorization: `Bearer ${process.env.FASHN_API_KEY}`,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`FASHN poll error: ${res.status} — ${err}`);
  }

  return res.json();
}

/**
 * 轮询直到完成（带超时）
 */
export async function waitForTryOn(
  predictionId: string,
  maxWaitMs = 120_000,
  pollIntervalMs = 2000
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const result = await pollTryOnResult(predictionId);

    if (result.status === "completed" && result.output_url) {
      return result.output_url;
    }
    if (result.status === "failed") {
      throw new Error(result.error || "Try-on generation failed");
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error("Try-on timed out");
}

/**
 * 批量换装：多件衣服穿到同一张参考图上
 */
export async function batchTryOn(
  modelImageUrl: string,
  garmentUrls: string[]
): Promise<string[]> {
  const predictionIds = await Promise.all(
    garmentUrls.map((url) =>
      startTryOn({
        model_image_url: modelImageUrl,
        garment_image_url: url,
      })
    )
  );

  const results = await Promise.all(
    predictionIds.map((p) => waitForTryOn(p.id))
  );

  return results;
}
