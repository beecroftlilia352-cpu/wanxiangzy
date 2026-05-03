import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit } from "@/lib/api/rate-limit";

export const maxDuration = 60;

const SYSTEM_PROMPT = `你是 VastWear AI 助手，一个专业的服装视觉 AI 智能体。你具备以下能力：

## 核心能力

1. **图片分析与解读**：用户上传图片后，你能识别图中的服装品类、版型、颜色、面料、风格、场景、文字等细节，给出专业描述。

2. **视觉创意建议**：根据用户上传的服装图，推荐拍摄风格、构图方案、配色建议、场景搭配、模特选择等。

3. **图像生成任务**：当用户明确要求生成图片时（换装、种草图、3D展示、换背景、姿势裂变、专属模特），调用生图 API 执行。

4. **辅助对话**：像专业顾问一样聊天，回答关于服装、电商视觉、摄影、设计的问题。

## 回复格式

严格按 JSON 回复，不要输出其他内容：
{
  "reply": "你的自然语言回复（支持 Markdown，要详细专业）",
  "action": "chat 或 generate",
  "module": "tryon|grass|garment_3d|model|model_background|pose 或 null",
  "imageMapping": {},
  "prompt": "生图提示词（仅 action=generate 时需要）",
  "style": "风格建议"
}

## 判断规则

**action: "generate"** 的条件（必须全部满足）：
- 用户明确要求生成/制作/出图/换装/种草等生图意图
- 已上传了图片
- 图片已通过 imgbb 托管（有 hostedUrl）

**action: "chat"** 的情况：
- 用户只是聊天、提问、分析图片
- 用户要求生图但没上传图片 → 在 reply 中提醒上传
- 用户问你是谁、问能力
- 任何不确定的情况

## 生图模块选择

当 action=generate 时，根据用户意图选择 module：
- "换装/穿上/试穿/上身" → tryon
- "种草/小红书/街拍/生活感" → grass
- "3D/立体/商品展示" → garment_3d
- "专属模特/建模特/定制脸" → model
- "换背景/换场景/换模特" → model_background
- "四宫格/姿势裂变/多姿势" → pose

imageMapping 用图号映射，例如 {"clothing_urls": [1], "reference_url": 2}。

## 回复风格

- 用中文，专业但友好
- 分析图片时要详细具体（品类、颜色、面料、适合场景）
- 给建议时要实用可操作
- 支持 Markdown 格式（表格、列表、粗体、引用、分段）`;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`agent-chat:${auth.user.id}`, 30, 60_000);
    if (!limit.ok) {
      return new Response(JSON.stringify({ error: "请求过于频繁" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json().catch(() => ({}));
    const { message, images, history, mode } = body as {
      message?: string;
      images?: Array<{ index: number; url: string }>;
      history?: Array<{ role: string; content: string }>;
      mode?: string;
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
      const userText = (message || "").trim() || "请分析这些图片的内容，并告诉我可以用它们做什么。";
      userContent.push({
        type: "text",
        text: `模式：${mode || "agent"}\n用户指令：${userText}\n图片编号：${images!.map((img) => `图${img.index}`).join("、")}`,
      });
      for (const img of images!) {
        userContent.push({ type: "image_url", image_url: { url: img.url } });
      }
    } else {
      userContent.push({
        type: "text",
        text: `模式：${mode || "agent"}\n用户消息：${message.trim()}`,
      });
    }
    messages.push({ role: "user", content: userContent });

    // 流式调用 LLM
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
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: provider.model,
            messages,
            max_tokens: 1000,
            temperature: 0.4,
            stream: true,
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (llmResponse.ok) break;
        llmResponse = null;
      } catch {
        llmResponse = null;
      }
    }

    if (!llmResponse || !llmResponse.body) {
      // 非流式降级
      return tryNonStream(providers, messages);
    }

    // 流式转发给客户端
    const reader = llmResponse.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let fullContent = "";

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
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({ chunk: delta })}\n\n`)
                  );
                }
              } catch {
                // skip malformed chunks
              }
            }
          }
        } catch {
          // stream error
        }

        // 流结束，发送完整响应（含 action 判断）
        const parsed = parseJson(fullContent);
        const result = parsed
          ? {
              reply: typeof parsed.reply === "string" ? parsed.reply : fullContent,
              action: parsed.action === "generate" && hasImages ? "generate" : "chat",
              module: typeof parsed.module === "string" ? parsed.module : null,
              imageMapping: typeof parsed.imageMapping === "object" ? parsed.imageMapping : {},
              prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
              style: typeof parsed.style === "string" ? parsed.style : null,
            }
          : { reply: fullContent || "我没有理解你的意思。", action: "chat" };

        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ done: true, ...result })}\n\n`)
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error && err.name === "AbortError"
      ? "AI 响应超时，请重试。"
      : "处理出错，请重试。";
    return new Response(JSON.stringify({ reply: msg, action: "chat" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

/** 流式失败时的非流式降级 */
async function tryNonStream(providers: Array<{ apiKey: string; baseUrl: string; model: string }>, messages: Array<unknown>) {
  for (const provider of providers) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: provider.model, messages, max_tokens: 1000, temperature: 0.4 }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (res.ok) {
        const data = await res.json();
        const content = (data.choices?.[0]?.message?.content as string) || "";
        const parsed = parseJson(content);
        const result = parsed
          ? { reply: parsed.reply || content, action: parsed.action === "generate" ? "generate" : "chat", module: parsed.module, imageMapping: parsed.imageMapping, prompt: parsed.prompt, style: parsed.style }
          : { reply: content, action: "chat" };
        return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
      }
    } catch { /* try next */ }
  }
  return new Response(JSON.stringify({ reply: "AI 服务暂时不可用。", action: "chat" }), {
    headers: { "Content-Type": "application/json" },
  });
}

function parseJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}
