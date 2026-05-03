/**
 * POST /api/agent/ai-write
 * 根据已上传图片分析内容，优化提示词
 */

import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 30;

const SYSTEM_PROMPT = `你是一个专业的电商服装视觉 AI 提示词工程师。
根据用户上传的服装图片，生成一段高质量的图像生成提示词。

要求：
1. 用中文描述服装细节（品类、版型、颜色、图案、面料、纹理、配饰）
2. 用英文写摄影参数（camera, lens, lighting, composition）
3. 一段连贯的话，200-400字
4. 强调真实摄影质感、自然光影、真实皮肤、布料褶皱
5. 结尾包含：photorealistic, 8K ultra-detailed, sharp details, commercial photography quality
6. 如果有多张图，说明图1/图2各自的角色（服装图/参考图/模特脸图）
7. 不要分段，不要列表，直接输出提示词`;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`ai-write:${auth.user.id}`, 10, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json().catch(() => ({}));
    const { images, currentPrompt } = body as { images?: string[]; currentPrompt?: string };

    if (!images || images.length === 0) {
      return NextResponse.json({ error: "请先上传图片" }, { status: 400 });
    }

    const llm = getLlmConfig("vision");
    if (!llm.apiKey || !llm.baseUrl) {
      return NextResponse.json({ optimizedPrompt: currentPrompt || "", source: "fallback" });
    }

    const imageRefs = images.map((_: string, i: number) => `图${i + 1}`);
    const userContent = [
      {
        type: "text",
        text: `请分析这些图片并生成图像生成提示词。\n图片编号：${imageRefs.join("、")}\n${currentPrompt ? `\n用户已有提示词（请优化）：${currentPrompt}` : ""}`,
      },
      ...images.map((url: string) => ({ type: "image_url", image_url: { url } })),
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(getChatCompletionsUrl(llm), {
      method: "POST",
      headers: { Authorization: `Bearer ${llm.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: llm.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        max_tokens: 800,
        temperature: 0.4,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      return NextResponse.json({ optimizedPrompt: currentPrompt || "", source: "fallback" });
    }

    const data = await res.json();
    const content = extractText(data).trim();

    return NextResponse.json({
      optimizedPrompt: content || currentPrompt || "",
      source: content ? "ai" : "fallback",
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ optimizedPrompt: "", source: "timeout" });
    }
    console.error("[ai-write] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ optimizedPrompt: "", source: "error" });
  }
}

function extractText(data: Record<string, unknown>): string {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const msg = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  if (typeof content === "string") return content;
  return "";
}
