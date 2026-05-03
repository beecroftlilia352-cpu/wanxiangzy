import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 30;

const SYSTEM_PROMPT = `你是 VastWear AI 服装视觉助手。你精通电商服装视觉、摄影构图、风格搭配和 AI 生图技术。

用户可能上传服装图片并用 @图N 引用。你需要：
1. 分析图片中的服装细节（品类、版型、颜色、图案、面料、风格）
2. 回答用户关于服装的问题
3. 给出专业的视觉建议（适合什么场景、什么风格、什么构图）
4. 如果用户需要生成图片，建议他们切换到 Agent 模式

用中文回复，简洁专业，像一个资深的电商视觉顾问。`;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`agent-chat:${auth.user.id}`, 30, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json().catch(() => ({}));
    const { message, images, history } = body as {
      message?: string;
      images?: Array<{ index: number; url: string }>;
      history?: Array<{ role: string; content: string }>;
    };

    if (!message?.trim()) {
      return NextResponse.json({ reply: "请输入消息。" });
    }

    const llm = getLlmConfig(images && images.length > 0 ? "vision" : "text");
    if (!llm.apiKey || !llm.baseUrl) {
      return NextResponse.json({ reply: "AI 服务暂时不可用。" });
    }

    const messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (history) {
      for (const msg of history.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const userContent: Array<Record<string, unknown>> = [{ type: "text", text: message }];
    if (images) {
      for (const img of images) {
        userContent.push({ type: "image_url", image_url: { url: img.url } });
      }
    }

    messages.push({ role: "user", content: userContent });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(getChatCompletionsUrl(llm), {
      method: "POST",
      headers: { Authorization: `Bearer ${llm.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: llm.model, messages, max_tokens: 600, temperature: 0.5 }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return NextResponse.json({ reply: "AI 暂时无法回复。" });

    const data = await res.json();
    const content = extractText(data);

    return NextResponse.json({ reply: content || "我没有理解你的意思。" });
  } catch (err: unknown) {
    return NextResponse.json({ reply: "处理出错，请重试。" });
  }
}

function extractText(data: Record<string, unknown>): string {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const msg = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  if (typeof content === "string") return content;
  return "";
}
