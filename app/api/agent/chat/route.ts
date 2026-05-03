import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 30;

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
- 支持 Markdown 格式（列表、粗体、分段）`;

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
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // 历史消息
    if (history) {
      for (const msg of history.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // 用户消息
    const userContent: Array<Record<string, unknown>> = [];
    if (hasImages) {
      userContent.push({
        type: "text",
        text: `模式：${mode || "agent"}\n用户指令：${message.trim()}\n图片编号：${images!.map((img) => `图${img.index}`).join("、")}`,
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

    // 主备双 LLM 降级：先试配置的 provider，超时则切换
    const providers = [llm];
    if (llm.provider === "xiaomi") {
      const lingya = getLlmConfig(hasImages ? "vision" : "text");
      if (lingya.provider !== "xiaomi" && lingya.apiKey && lingya.baseUrl) {
        providers.push(lingya);
      }
    } else {
      const xiaomi = getLlmConfig(hasImages ? "vision" : "text");
      if (xiaomi.provider !== "lingya" && xiaomi.apiKey && xiaomi.baseUrl) {
        providers.push(xiaomi);
      }
    }

    let res: Response | null = null;
    let lastError = "";

    for (const provider of providers) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        res = await fetch(getChatCompletionsUrl(provider), {
          method: "POST",
          headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: provider.model, messages, max_tokens: 1000, temperature: 0.4 }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        if (res.ok) break;
        lastError = `HTTP ${res.status}`;
        res = null;
      } catch (err) {
        clearTimeout(timeout);
        lastError = err instanceof Error ? err.name === "AbortError" ? "timeout" : err.message : "unknown";
        res = null;
      }
    }

    if (!res) {
      const msg = lastError === "timeout"
        ? "AI 响应超时，服务繁忙，请稍后重试。"
        : `AI 服务暂时不可用（${lastError}）。`;
      return NextResponse.json({ reply: msg, action: "chat" });
    }

    const data = await res.json();
    const content = extractText(data);
    const parsed = parseJson(content);

    if (parsed) {
      return NextResponse.json({
        reply: typeof parsed.reply === "string" ? parsed.reply : content,
        action: parsed.action === "generate" && hasImages ? "generate" : "chat",
        module: typeof parsed.module === "string" ? parsed.module : null,
        imageMapping: typeof parsed.imageMapping === "object" ? parsed.imageMapping : {},
        prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
        style: typeof parsed.style === "string" ? parsed.style : null,
      });
    }

    return NextResponse.json({ reply: content || "我没有理解你的意思，可以换个方式描述吗？", action: "chat" });
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
