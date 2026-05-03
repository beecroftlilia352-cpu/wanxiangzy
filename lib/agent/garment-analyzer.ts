import type { GarmentAnalysis } from "./types";

/**
 * 调用视觉 AI 分析服装图片，返回结构化结果。
 * 复用现有的 /api/analyze-images LLM 能力。
 */
export async function analyzeGarment(imageUrl: string, fileName: string): Promise<GarmentAnalysis> {
  const fallback: GarmentAnalysis = {
    imageUrl,
    fileName,
    category: "服装",
    style: "简约",
    colors: [],
    season: "四季",
    suggestion: "",
    status: "done",
  };

  try {
    const res = await fetch("/api/agent/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl, fileName }),
    });

    if (!res.ok) return fallback;

    const data = await res.json();
    return {
      imageUrl,
      fileName,
      category: data.category || fallback.category,
      style: data.style || fallback.style,
      colors: Array.isArray(data.colors) ? data.colors : fallback.colors,
      season: data.season || fallback.season,
      suggestion: data.suggestion || "",
      status: "done",
    };
  } catch {
    return fallback;
  }
}

/**
 * 批量分析多张服装图片
 */
export async function analyzeGarments(
  images: Array<{ url: string; name: string }>,
  onProgress?: (index: number, analysis: GarmentAnalysis) => void
): Promise<GarmentAnalysis[]> {
  const results: GarmentAnalysis[] = [];

  for (let i = 0; i < images.length; i++) {
    const analysis = await analyzeGarment(images[i].url, images[i].name);
    results.push(analysis);
    onProgress?.(i, analysis);
  }

  return results;
}
