import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit } from "@/lib/api/rate-limit";

export const maxDuration = 60;

const SYSTEM_PROMPT = `你是 VastWear AI 助手。你的回复必须且只能是一个 JSON 对象，不要输出任何其他文字。

JSON 格式：
{"reply":"你的中文回复，支持Markdown","action":"chat","module":null,"imageMapping":{},"prompt":"","style":null}

action 取值规则：
- 用户要求生成/制作/出图/换装/种草/做模特/换背景/3D/四宫格 且有图片 → "action":"generate"
- 用户只是聊天/提问/分析图片 → "action":"chat"

当 action 为 "generate" 时，module 必须是以下之一：
- "tryon"（换装/穿上/试穿/上身）
- "grass"（种草/小红书/街拍）
- "garment_3d"（3D/立体/商品展示）
- "model"（专属模特/建模特/定制脸）
- "model_background"（换背景/换场景/换模特）
- "pose"（四宫格/姿势裂变）

当 action 为 "generate" 时，imageMapping 必须指定图片角色，例如：
{"clothing_urls":[1],"reference_url":2} 表示图1是服装，图2是参考

示例：
用户："帮我把图1穿到图2身上"（有2张图片）
回复：{"reply":"好的，正在为您生成换装效果图...","action":"generate","module":"tryon","imageMapping":{"clothing_urls":[1],"reference_url":2},"prompt":"...","style":null}

用户："你是谁"
回复：{"reply":"我是VastWear AI助手...","action":"chat","module":null,"imageMapping":{},"prompt":"","style":null}`;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`agent-chat:${auth.user.id}`, 30, 60_000);
    if (!limit.ok) {
      return new Response(JSON.stringify({ reply: "请求过于频繁", action: "chat" }), {
        status: 429, headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json().catch(() => ({}));
    const { message, images, history, mode } = body as {
      message?: string; images?: Array<{ index: number; url: string }>;
      history?: Array<{ role: string; content: string }>; mode?: string;
    };

    if (!message?.trim() && (!images || images.length === 0)) {
      return new Response(JSON.stringify({ reply: "请输入消息或上传图片。", action: "chat" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const hasImages = images && images.length > 0;
    const llm = getLlmConfig(hasImages ? "vision" : "text");
    if (!llm.apiKey || !llm.baseUrl) {
      return new Response(JSON.stringify({ reply: "AI 服务暂时不可用。", action: "chat" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (history) {
      for (const msg of history.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const userContent: Array<Record<string, unknown>> = [];
    if (hasImages) {
      const userText = (message || "").trim() || "请分析这些图片并告诉我能做什么。";
      userContent.push({ type: "text", text: `模式：${mode || "agent"}\n指令：${userText}\n图片：${images!.map((img) => `图${img.index}`).join("、")}` });
      for (const img of images!) {
        userContent.push({ type: "image_url", image_url: { url: img.url } });
      }
    } else {
      userContent.push({ type: "text", text: `模式：${mode || "agent"}\n${(message || "").trim()}` });
    }
    messages.push({ role: "user", content: userContent });

    // 尝试流式调用 LLM
    const providers = [llm];
    if (llm.provider === "xiaomi") {
      const lingya = getLlmConfig(hasImages ? "vision" : "text");
      if (lingya.provider !== "xiaomi" && lingya.apiKey && lingya.baseUrl) providers.push(lingya);
    } else {
      const xiaomi = getLlmConfig(hasImages ? "vision" : "text");
      if (xiaomi.provider !== "lingya" && xiaomi.apiKey && xiaomi.baseUrl) providers.push(xiaomi);
    }

    let llmResponse: Response | null = null;
    for (const provider of providers) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 55000);
        llmResponse = await fetch(getChatCompletionsUrl(provider), {
          method: "POST",
          headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: provider.model, messages, max_tokens: 1000, temperature: 0.3, stream: true }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        if (llmResponse.ok) break;
        llmResponse = null;
      } catch { llmResponse = null; }
    }

    if (!llmResponse || !llmResponse.body) {
      return tryNonStream(providers, messages);
    }

    // 流式处理 — 只转发 reply 内容，不暴露原始 JSON 给客户端
    const reader = llmResponse.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let fullContent = "";
        let lastReplyLen = 0;  // 已发送的 reply 长度

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;
              const data = trimmed.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  fullContent += delta;
                  // 尝试从累积内容中增量提取 reply 文本
                  const replyText = extractReplyIncremental(fullContent);
                  if (replyText.length > lastReplyLen) {
                    const newPart = replyText.slice(lastReplyLen);
                    lastReplyLen = replyText.length;
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ chunk: newPart })}\n\n`));
                  }
                }
              } catch {}
            }
          }
        } catch {}

        // 流结束：完整提取结构化数据
        const extracted = extractResponse(fullContent, hasImages === true);
        // 如果增量提取的 reply 和最终提取的不同，用最终版本替换
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ done: true, ...extracted })}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error && err.name === "AbortError" ? "AI 响应超时，请稍后重试。" : "处理出错，请重试。";
    return new Response(JSON.stringify({ reply: msg, action: "chat" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * 从 LLM 累积内容中提取结构化响应
 * 处理各种 LLM 输出格式：纯 JSON、JSON+解释文字、markdown 包裹的 JSON
 */
/**
 * 从不完整的 JSON 中增量提取 reply 字段值
 * 用于流式场景：JSON 还没闭合，但 reply 值已经在增长
 *
 * 原理：找 "reply":" 的位置，提取后面的所有字符直到遇到
 * 未转义的 "（后跟 , 或 }），即为当前已知的 reply 内容。
 */
function extractReplyIncremental(content: string): string {
  // 找 "reply": " 或 "reply":" 的位置
  const match = content.match(/"reply"\s*:\s*"/);
  if (!match || match.index == null) return "";

  const start = match.index + match[0].length;
  let result = "";
  let i = start;
  let escaped = false;

  while (i < content.length) {
    const ch = content[i];
    if (escaped) {
      // 处理转义字符
      result += ch === "n" ? "\n" : ch === "t" ? "\t" : ch === '"' ? '"' : ch === "\\" ? "\\" : `\\${ch}`;
      escaped = false;
    } else if (ch === "\\") {
      escaped = true;
    } else if (ch === '"') {
      // 检查是否是值的结束引号（后面跟 , 或 } 或空白）
      const next = content[i + 1];
      if (next === "," || next === "}" || next === " " || next === "\n" || next === undefined) {
        break;
      }
      // 否则可能是 JSON 中其他字段的引号，继续
      result += ch;
    } else {
      result += ch;
    }
    i++;
  }

  return result;
}

function extractResponse(content: string, hasImages: boolean): {
  reply: string; action: string; module: string | null;
  imageMapping: Record<string, unknown>; prompt: string; style: string | null;
} {
  // 策略1：尝试直接解析整个内容为 JSON
  const directJson = tryParseJson(content.trim());
  if (directJson && typeof directJson.reply === "string") {
    return normalizeResult(directJson, hasImages);
  }

  // 策略2：用正则提取 JSON 对象（处理 LLM 在 JSON 前后加文字的情况）
  const jsonMatch = content.match(/\{[\s\S]*?"reply"\s*:[\s\S]*?\}/);
  if (jsonMatch) {
    const parsed = tryParseJson(jsonMatch[0]);
    if (parsed && typeof parsed.reply === "string") {
      return normalizeResult(parsed, hasImages);
    }
  }

  // 策略3：提取 markdown 代码块中的 JSON
  const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    const parsed = tryParseJson(codeBlockMatch[1]);
    if (parsed && typeof parsed.reply === "string") {
      return normalizeResult(parsed, hasImages);
    }
  }

  // 策略4：找最后一个完整的 { ... } 块
  const lastBrace = content.lastIndexOf("{");
  const lastClose = content.lastIndexOf("}");
  if (lastBrace >= 0 && lastClose > lastBrace) {
    const candidate = content.slice(lastBrace, lastClose + 1);
    const parsed = tryParseJson(candidate);
    if (parsed && typeof parsed.reply === "string") {
      return normalizeResult(parsed, hasImages);
    }
  }

  // 全部失败：返回清理后的纯文本
  const cleaned = content
    .replace(/```json\s*[\s\S]*?```/g, "")
    .replace(/```\s*[\s\S]*?```/g, "")
    .replace(/\{[\s]*"(reply|action|module)"[\s\S]*?\}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { reply: cleaned || "处理完成。", action: "chat", module: null, imageMapping: {}, prompt: "", style: null };
}

function normalizeResult(parsed: Record<string, unknown>, hasImages: boolean) {
  return {
    reply: typeof parsed.reply === "string" ? parsed.reply : "",
    action: parsed.action === "generate" && hasImages ? "generate" : "chat",
    module: typeof parsed.module === "string" ? parsed.module : null,
    imageMapping: typeof parsed.imageMapping === "object" && parsed.imageMapping !== null ? parsed.imageMapping as Record<string, unknown> : {},
    prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
    style: typeof parsed.style === "string" && parsed.style !== "null" ? parsed.style : null,
  };
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text); } catch { return null; }
}

async function tryNonStream(providers: Array<{ apiKey: string; baseUrl: string; model: string }>, messages: Array<unknown>) {
  for (const provider of providers) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: provider.model, messages, max_tokens: 1000, temperature: 0.3 }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (res.ok) {
        const data = await res.json();
        const content = (data.choices?.[0]?.message?.content as string) || "";
        const extracted = extractResponse(content, true);
        return new Response(JSON.stringify(extracted), { headers: { "Content-Type": "application/json" } });
      }
    } catch {}
  }
  return new Response(JSON.stringify({ reply: "AI 服务暂时不可用。", action: "chat" }), {
    headers: { "Content-Type": "application/json" },
  });
}
