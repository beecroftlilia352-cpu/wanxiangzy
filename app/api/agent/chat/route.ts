/**
 * POST /api/agent/chat
 * LLM 驱动的 AI 服装助手 Agent
 * 理解自然语言，识别意图，提取参数，给出建议
 */

import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 60;

const SYSTEM_PROMPT = `你是 VastWear AI 服装助手，一个专业的电商服装视觉生成顾问。你的工作是理解用户需求，帮助他们选择正确的生成模块并填充参数。

## 你可以调用的模块

### 1. tryon — 服装上身
把服装穿到模特身上，生成真实试穿效果。
- 必需：clothing_urls（服装图，1-5张）
- 可选：model_face_url（模特脸图）、reference_url（参考姿势图）、style（风格描述）、ai_model、aspect_ratio、image_size、gen_count
- 适用场景：用户说"换装""上身""试穿""穿到模特身上"

### 2. grass — 服装种草图
生成小红书风格的穿搭种草图。
- 必需：garment_url（服装图，1张）
- 可选：reference_url（参考场景图）、template_id（场景模板：street/cafe/home/elevator）、scene_mode（auto/upload_reference/custom_prompt）、style、ai_model、gen_count
- 适用场景：用户说"种草""小红书""街拍""生活感"

### 3. model — 专属模特
融合参考人脸创建稳定的专属AI模特。
- 必需：reference_urls（参考人脸图，1-3张）
- 可选：hair_reference_url、hair_color_reference_url、gender（male/female）、model_style（fusion_natural/ecommerce_clean/lookbook/magazine/korean_clear/xiaohongshu_life/european_campaign）、ai_model、gen_count
- 适用场景：用户说"专属模特""建模特""定制模特"

### 4. model_background — 换背景/换模特
替换图片背景或更换模特。
- 必需：source_url（原图）、mode（background_only/model_only/both）
- 可选：model_reference_url（换模特时需要）、background_reference_url、background_source（auto_prompt/upload/preset）、template_id、background_text、ai_model、gen_count
- 适用场景：用户说"换背景""换模特""换景"

### 5. pose — 姿势裂变
一张图生成四个不同姿势的2x2四宫格。
- 必需：main_image_url（主图）
- 可选：ai_model、gen_count
- 适用场景：用户说"四宫格""姿势裂变""多个姿势"

### 6. garment_3d — 服装3D
把平铺图/人台图转换为3D立体商品展示。
- 必需：garment_url（服装图）
- 可选：reference_url（3D参考图）、garment_type、display_style、ai_model、gen_count
- 适用场景：用户说"3D""立体""商品展示"

## 通用参数
- ai_model: "gpt-image-2"（默认）| "doubao-seedream-4-5-251128" | "nano-banana-2" | "nano-banana-pro"
- aspect_ratio: "3:4"（默认）| "1:1" | "9:16" | "4:3" | "16:9"
- image_size: "1K"（默认）| "2K" | "4K"
- gen_count: 1-4，默认 1

## 回复格式

你必须严格按以下 JSON 格式回复，不要输出任何其他内容：

\`\`\`json
{
  "reply": "你的自然语言回复（友好、专业、简洁）",
  "intent": "tryon|grass|model|model_background|pose|garment_3d|null",
  "params": {},
  "missing": [],
  "confidence": 0.9
}
\`\`\`

字段说明：
- reply: 自然语言回复，会直接展示给用户。友好、专业、简洁。
- intent: 识别到的模块，如果不确定则为 null
- params: 已确定的参数对象（只包含你有把握的参数）
- missing: 还缺少的必需信息列表（如 "请上传一张服装图"）
- confidence: 0-1 的置信度

## 重要规则
1. 如果用户上传了图片但没说做什么，根据图片内容推荐最合适的模块
2. 如果用户说了做什么但没上传图片，在 missing 中说明需要什么图片
3. 如果用户意图模糊，友好地询问并给出选项
4. 风格描述要自动提取：韩系→korean_clear，电商→ecommerce_clean，杂志→magazine 等
5. gen_count 从用户说的"几张""4张"等提取，默认 1
6. 回复用中文，简洁友好，像一个专业的电商视觉顾问
7. 如果用户说"再来了""换一个""换个风格"，理解为对上一个任务的变体请求`;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  message: string;
  imageUrls?: string[];
  history?: ChatMessage[];
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`agent-chat:${auth.user.id}`, 30, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const { message, imageUrls, history } = body;

    if (!message?.trim() && (!imageUrls || imageUrls.length === 0)) {
      return NextResponse.json({ error: "请输入消息或上传图片" }, { status: 400 });
    }

    const llm = getLlmConfig(imageUrls && imageUrls.length > 0 ? "vision" : "text");
    if (!llm.apiKey || !llm.baseUrl) {
      // 降级到简单回复
      return NextResponse.json({
        reply: "AI 服务暂时不可用，请稍后重试。",
        intent: null,
        params: {},
        missing: [],
        confidence: 0,
      });
    }

    // 构建消息列表
    const messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // 添加历史对话（最多保留最近 6 轮）
    if (history && history.length > 0) {
      const recentHistory = history.slice(-12);
      for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // 构建当前用户消息（可能包含图片）
    const userContent: Array<Record<string, unknown>> = [];

    if (message?.trim()) {
      userContent.push({ type: "text", text: message.trim() });
    }

    if (imageUrls && imageUrls.length > 0) {
      for (const url of imageUrls) {
        userContent.push({ type: "image_url", image_url: { url } });
      }
      if (!message?.trim()) {
        userContent.unshift({
          type: "text",
          text: "（用户上传了图片，请分析图片内容并推荐最合适的模块和参数）",
        });
      }
    }

    messages.push({
      role: "user",
      content: imageUrls && imageUrls.length > 0 ? userContent : (message?.trim() || ""),
    });

    // 调用 LLM
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(getChatCompletionsUrl(llm), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llm.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llm.model,
        messages,
        max_tokens: 800,
        temperature: 0.3,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[agent-chat] LLM error:", res.status);
      return NextResponse.json({
        reply: "AI 暂时无法处理，请换个方式描述你的需求。",
        intent: null,
        params: {},
        missing: [],
        confidence: 0,
      });
    }

    const data = await res.json();
    const content = extractMessageText(data);

    // 解析 JSON 响应
    const parsed = parseAgentResponse(content);

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({
        reply: "AI 响应超时，请重新描述你的需求。",
        intent: null,
        params: {},
        missing: [],
        confidence: 0,
      });
    }
    console.error("[agent-chat] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({
      reply: "处理出错了，请重试。",
      intent: null,
      params: {},
      missing: [],
      confidence: 0,
    });
  }
}

function extractMessageText(data: Record<string, unknown>): string {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          if (typeof obj.text === "string") return obj.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function parseAgentResponse(content: string): {
  reply: string;
  intent: string | null;
  params: Record<string, unknown>;
  missing: string[];
  confidence: number;
} {
  // 尝试从 markdown code block 中提取 JSON
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      reply: typeof parsed.reply === "string" ? parsed.reply : content,
      intent: typeof parsed.intent === "string" && parsed.intent !== "null" ? parsed.intent : null,
      params: typeof parsed.params === "object" && parsed.params !== null ? parsed.params : {},
      missing: Array.isArray(parsed.missing) ? parsed.missing : [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
  } catch {
    // JSON 解析失败，返回纯文本回复
    return {
      reply: content.replace(/```[\s\S]*?```/g, "").trim() || content,
      intent: null,
      params: {},
      missing: [],
      confidence: 0,
    };
  }
}
