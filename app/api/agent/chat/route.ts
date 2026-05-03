import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 30;

const CHAT_SYSTEM_PROMPT = `你是 VastWear AI 服装视觉助手。你精通电商服装视觉、摄影构图、风格搭配和 AI 生图技术。

用户可能上传服装图片并用 @图N 引用。

你的回复必须是严格的 JSON 格式，不要输出其他内容：
{
  "reply": "你的自然语言回复（支持 Markdown）",
  "action": "chat 或 generate",
  "module": "tryon|grass|garment_3d|model|model_background|pose 或 null",
  "imageMapping": {},
  "prompt": "生图提示词（仅 action=generate 时）",
  "style": "风格（仅 action=generate 时）"
}

判断规则：
- 如果用户只是聊天、提问、问你是谁 → action: "chat"
- 如果用户明确要求生成图片（换装、种草、3D、换背景、姿势裂变）且上传了图片 → action: "generate"
- 如果用户要求生图但没上传图片 → action: "chat"，在 reply 中提醒用户上传图片
- 如果用户说"帮我xxx"且有图片 → 大概率是 generate
- 如果不确定 → action: "chat"

imageMapping 用图号映射：{"clothing_urls": [1], "reference_url": 2} 表示图1是服装，图2是参考。
prompt 是根据图片内容自动生成的专业摄影提示词。`;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`agent-chat:${auth.user.id}`, 30, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json().catch(() => ({}));
    const { message, images, history, mode } = body as {
      message?: string;
      images?: Array<{ index: number; url: string }>;
      history?: Array<{ role: string; content: string }>;
      mode?: string;
    };

    if (!message?.trim()) {
      return NextResponse.json({ reply: "请输入消息。", action: "chat" });
    }

    const hasImages = images && images.length > 0;
    const llm = getLlmConfig(hasImages ? "vision" : "text");
    if (!llm.apiKey || !llm.baseUrl) {
      return NextResponse.json({ reply: "AI 服务暂时不可用。", action: "chat" });
    }

    const messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
    ];

    if (history) {
      for (const msg of history.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // 构建用户消息
    const userContent: Array<Record<string, unknown>> = [];

    if (hasImages) {
      userContent.push({
        type: "text",
        text: `当前模式：${mode || "agent"}\n用户指令：${message.trim()}\n图片编号：${images!.map((img) => `图${img.index}`).join("、")}`,
      });
      for (const img of images!) {
        userContent.push({ type: "image_url", image_url: { url: img.url } });
      }
    } else {
      userContent.push({
        type: "text",
        text: `当前模式：${mode || "agent"}\n用户消息：${message.trim()}`,
      });
    }

    messages.push({ role: "user", content: userContent });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(getChatCompletionsUrl(llm), {
      method: "POST",
      headers: { Authorization: `Bearer ${llm.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: llm.model, messages, max_tokens: 800, temperature: 0.3 }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      return NextResponse.json({ reply: "AI 暂时无法回复。", action: "chat" });
    }

    const data = await res.json();
    const content = extractText(data);
    const parsed = parseJson(content);

    if (parsed) {
      return NextResponse.json({
        reply: typeof parsed.reply === "string" ? parsed.reply : content,
        action: parsed.action === "generate" ? "generate" : "chat",
        module: typeof parsed.module === "string" ? parsed.module : null,
        imageMapping: typeof parsed.imageMapping === "object" ? parsed.imageMapping : {},
        prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
        style: typeof parsed.style === "string" ? parsed.style : null,
      });
    }

    // JSON 解析失败，返回纯文本
    return NextResponse.json({ reply: content || "我没有理解你的意思。", action: "chat" });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ reply: "AI 响应超时，请重试。", action: "chat" });
    }
    return NextResponse.json({ reply: "处理出错，请重试。", action: "chat" });
  }
}

function extractText(data: Record<string, unknown>): string {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const msg = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  if (typeof content === "string") return content;
  return "";
}

function parseJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}
