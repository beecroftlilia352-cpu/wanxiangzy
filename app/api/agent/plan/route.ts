/**
 * POST /api/agent/plan
 * Agent 任务规划 — LLM 分析用户需求，生成多步骤执行计划
 */

import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { formatToolsForPrompt } from "@/lib/agent/tools";

export const maxDuration = 60;

const PLAN_SYSTEM_PROMPT = `你是 VastWear AI 任务规划器。你的工作是分析用户需求，制定一个清晰的多步骤执行计划。

## 可用工具

${formatToolsForPrompt()}

## 输出格式

严格返回 JSON，不要输出其他内容：
{
  "reply": "对用户的友好回复（中文，说明你理解的需求和计划概要）",
  "plan": {
    "title": "计划简短标题",
    "steps": [
      {
        "id": "step_1",
        "tool": "工具名称",
        "label": "步骤简短描述",
        "description": "详细说明这步做什么",
        "params": {},
        "depends_on": [],
        "status": "pending"
      }
    ]
  },
  "needs_clarification": false,
  "clarification_question": ""
}

## 规划规则

1. **单步任务**：用户说"帮我把衣服穿到模特身上" → 1 步：generate_tryon
2. **多步任务**：用户说"帮我建一个韩系模特，然后用它做种草图" → 2 步：generate_model → generate_grass
3. **分析+生成**：用户上传图片说"分析一下然后帮我做主图" → 2 步：analyze_image → generate_tryon
4. **批量任务**：用户上传 5 张图说"全部做种草图" → 1 步：generate_grass（params 中包含所有图片）

## 参数映射规则

- @图1 → image index 1 → 映射到对应工具的 image_url/clothing_urls/garment_url 等
- 用户说"韩系" → style: "韩系清透"
- 用户说"3:4" → aspect_ratio: "3:4"
- 用户没指定 → 使用合理默认值

## 重要

- 如果用户意图模糊，设置 needs_clarification: true 并在 clarification_question 中提问
- 如果只有文字没有图片且需要图片，提醒用户上传
- reply 要简洁友好，说明计划概要
- 每个步骤的 label 要简短（5-10字），显示在进度卡片上`;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`agent-plan:${auth.user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json().catch(() => ({}));
    const { message, images, history, mode, params: genParams } = body as {
      message?: string;
      images?: Array<{ index: number; url: string }>;
      history?: Array<{ role: string; content: string }>;
      mode?: string;
      params?: { model?: string; aspectRatio?: string; imageSize?: string; count?: number };
    };

    if (!message?.trim() && (!images || images.length === 0)) {
      return NextResponse.json({ reply: "请输入指令或上传图片。", plan: null });
    }

    const hasImages = images && images.length > 0;
    const llm = getLlmConfig(hasImages ? "vision" : "text");

    if (!llm.apiKey || !llm.baseUrl) {
      // 降级：关键词匹配生成简单计划
      return NextResponse.json(buildFallbackPlan(message || "", images || [], genParams));
    }

    // 构建 LLM 消息
    const messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = [
      { role: "system", content: PLAN_SYSTEM_PROMPT },
    ];

    if (history) {
      for (const msg of history.slice(-8)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const userContent: Array<Record<string, unknown>> = [];
    const imageDesc = hasImages
      ? `\n图片编号：${images!.map((img) => `图${img.index}`).join("、")}`
      : "";

    const paramDesc = genParams
      ? `\n用户设置：模型=${genParams.model || "gpt-image-2"}，比例=${genParams.aspectRatio || "3:4"}，尺寸=${genParams.imageSize || "1K"}，张数=${genParams.count || 1}`
      : "";

    userContent.push({
      type: "text",
      text: `用户指令：${(message || "").trim() || "根据上传的图片分析并推荐操作"}${imageDesc}${paramDesc}`,
    });

    if (hasImages) {
      for (const img of images!) {
        userContent.push({ type: "image_url", image_url: { url: img.url } });
      }
    }

    messages.push({ role: "user", content: userContent });

    // 调用 LLM
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    let llmResponse: Response | null = null;
    try {
      llmResponse = await fetch(getChatCompletionsUrl(llm), {
        method: "POST",
        headers: { Authorization: `Bearer ${llm.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: llm.model, messages, max_tokens: 1200, temperature: 0.3 }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
    } catch {
      llmResponse = null;
    }

    if (!llmResponse || !llmResponse.ok) {
      return NextResponse.json(buildFallbackPlan(message || "", images || [], genParams));
    }

    const data = await llmResponse.json();
    const content = extractText(data);
    const parsed = tryParseJson(content);

    if (parsed && parsed.plan) {
      return NextResponse.json({
        reply: typeof parsed.reply === "string" ? parsed.reply : "我来帮你处理。",
        plan: parsed.plan,
        needs_clarification: !!parsed.needs_clarification,
        clarification_question: typeof parsed.clarification_question === "string" ? parsed.clarification_question : "",
      });
    }

    // JSON 解析失败 → 降级
    return NextResponse.json(buildFallbackPlan(message || "", images || [], genParams));
  } catch (err: unknown) {
    const msg = err instanceof Error && err.name === "AbortError" ? "AI 规划超时，请重试。" : "规划失败，请重试。";
    return NextResponse.json({ reply: msg, plan: null });
  }
}

/** 降级：关键词匹配生成简单计划 */
function buildFallbackPlan(
  message: string,
  images: Array<{ index: number; url: string }>,
  params?: { model?: string; aspectRatio?: string; imageSize?: string; count?: number }
) {
  const hasImages = images.length > 0;
  const img1 = images[0]?.url || "";
  const img2 = images[1]?.url || "";

  const rules: Array<{ keywords: RegExp; tool: string; label: string; buildParams: () => Record<string, unknown> }> = [
    { keywords: /换装|穿上|试穿|上身/, tool: "generate_tryon", label: "服装上身",
      buildParams: () => ({ clothing_urls: [img1], reference_url: img2 || undefined, style: extractStyle(message), ...baseParams(params) }) },
    { keywords: /种草|街拍|小红书/, tool: "generate_grass", label: "种草图",
      buildParams: () => ({ garment_url: img1, scene: extractScene(message), ...baseParams(params) }) },
    { keywords: /3[dD]|立体/, tool: "generate_3d", label: "3D 展示",
      buildParams: () => ({ garment_url: img1, ...baseParams(params) }) },
    { keywords: /专属模特|建模特/, tool: "generate_model", label: "专属模特",
      buildParams: () => ({ reference_urls: images.map((img) => img.url), style: extractStyle(message), ...baseParams(params) }) },
    { keywords: /换背景|换场景/, tool: "generate_background", label: "换背景",
      buildParams: () => ({ source_url: img1, background_url: img2 || undefined, mode: "background_only", ...baseParams(params) }) },
    { keywords: /四宫格|姿势裂变/, tool: "generate_pose", label: "姿势裂变",
      buildParams: () => ({ main_image_url: img1, ...baseParams(params) }) },
    { keywords: /分析|看看|识别/, tool: "analyze_image", label: "图片分析",
      buildParams: () => ({ image_url: img1, focus: "general" }) },
    { keywords: /建议|风格|怎么拍/, tool: "style_advice", label: "风格建议",
      buildParams: () => ({ image_url: img1, context: "电商主图" }) },
  ];

  for (const rule of rules) {
    if (rule.keywords.test(message)) {
      return {
        reply: `好的，我来帮你${rule.label}。`,
        plan: {
          title: rule.label,
          steps: [{
            id: "step_1",
            tool: rule.tool,
            label: rule.label,
            description: `执行${rule.label}任务`,
            params: rule.buildParams(),
            depends_on: [],
            status: "pending",
          }],
        },
        needs_clarification: false,
        clarification_question: "",
      };
    }
  }

  // 有图片但没匹配到 → 分析图片
  if (hasImages) {
    return {
      reply: "我看到你上传了图片，让我先分析一下。",
      plan: {
        title: "图片分析",
        steps: [{
          id: "step_1",
          tool: "analyze_image",
          label: "分析图片",
          description: "分析图片内容并推荐后续操作",
          params: { image_url: img1, focus: "general" },
          depends_on: [],
          status: "pending",
        }],
      },
      needs_clarification: false,
      clarification_question: "",
    };
  }

  return {
    reply: "请上传图片并告诉我你想做什么，例如：\n• 帮我把衣服穿到模特身上\n• 做一张种草图\n• 换个背景",
    plan: null,
    needs_clarification: true,
    clarification_question: "请上传图片并描述你的需求。",
  };
}

function baseParams(params?: { model?: string; aspectRatio?: string; imageSize?: string; count?: number }) {
  return {
    ai_model: params?.model || "gpt-image-2",
    aspect_ratio: params?.aspectRatio || "3:4",
    image_size: params?.imageSize || "1K",
    gen_count: params?.count || 1,
  };
}

function extractStyle(text: string): string | null {
  if (/韩系|韩式/.test(text)) return "韩系清透";
  if (/电商|白底/.test(text)) return "电商白底";
  if (/杂志/.test(text)) return "时尚杂志";
  if (/街拍/.test(text)) return "欧美 Campaign";
  if (/小红书/.test(text)) return "小红书生活感";
  return null;
}

function extractScene(text: string): string {
  if (/咖啡|cafe/i.test(text)) return "cafe";
  if (/居家|home/.test(text)) return "home";
  if (/电梯/.test(text)) return "elevator";
  return "street";
}

function extractText(data: Record<string, unknown>): string {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const msg = choices?.[0]?.message as Record<string, unknown> | undefined;
  return typeof msg?.content === "string" ? msg.content : "";
}

function tryParseJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}
