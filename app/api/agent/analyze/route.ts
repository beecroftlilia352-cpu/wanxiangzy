/**
 * POST /api/agent/analyze
 * 分析服装图片，返回结构化的品类/风格/颜色/季节信息
 */

import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 30;

const ANALYZE_PROMPT = `你是一个专业的服装视觉分析师。请分析这张服装图片，返回严格的 JSON 格式：

{
  "category": "服装大类，只选：连衣裙、上装、下装、外套、连体衣、配饰",
  "style": "风格，只选：甜美、韩系、简约、复古、运动、通勤、性感、休闲",
  "colors": ["主要颜色1", "主要颜色2"],
  "season": "适合季节，只选：春夏、秋冬、四季",
  "suggestion": "一句话建议，20字以内，说明这件服装最适合什么场景拍摄"
}

规则：
- 只返回 JSON，不要其他内容
- colors 最多 3 个
- suggestion 要具体，如"碎花连衣裙适合咖啡店韩系街拍"`;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`agent-analyze:${auth.user.id}`, 30, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json().catch(() => ({}));
    const { imageUrl, fileName } = body as { imageUrl?: string; fileName?: string };

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json({ error: "缺少图片 URL" }, { status: 400 });
    }

    const llm = getLlmConfig("vision");
    if (!llm.apiKey || !llm.baseUrl) {
      return NextResponse.json({
        category: "服装",
        style: "简约",
        colors: [],
        season: "四季",
        suggestion: "",
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(getChatCompletionsUrl(llm), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llm.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llm.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: ANALYZE_PROMPT },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 300,
        temperature: 0.1,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      return NextResponse.json({
        category: "服装",
        style: "简约",
        colors: [],
        season: "四季",
        suggestion: "",
      });
    }

    const data = await res.json();
    const content = extractText(data);
    const parsed = parseAnalysis(content);

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({
        category: "服装", style: "简约", colors: [], season: "四季", suggestion: "",
      });
    }
    console.error("[agent-analyze] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({
      category: "服装", style: "简约", colors: [], season: "四季", suggestion: "",
    });
  }
}

function extractText(data: Record<string, unknown>): string {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const msg = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  if (typeof content === "string") return content;
  return "";
}

function parseAnalysis(text: string): Record<string, unknown> {
  // 尝试提取 JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { category: "服装", style: "简约", colors: [], season: "四季", suggestion: "" };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      category: typeof parsed.category === "string" ? parsed.category : "服装",
      style: typeof parsed.style === "string" ? parsed.style : "简约",
      colors: Array.isArray(parsed.colors) ? parsed.colors.slice(0, 3) : [],
      season: typeof parsed.season === "string" ? parsed.season : "四季",
      suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : "",
    };
  } catch {
    return { category: "服装", style: "简约", colors: [], season: "四季", suggestion: "" };
  }
}
