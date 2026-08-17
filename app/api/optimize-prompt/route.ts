/**
 * POST /api/optimize-prompt
 *
 * 调用 LLM 优化风格提示词
 * 将用户的简短描述扩展为专业的摄影/时尚风格指令
 */

import { getLlmLanguageName } from "@/lib/api/llm-locale";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { fetchLlmChat, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let style = "";
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`optimize-prompt:${auth.user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json();
    style = body.style || "";

    if (!style || typeof style !== "string") {
      return NextResponse.json({ error: "缺少 style 参数" }, { status: 400 });
    }

    const llm = await getLlmConfig("text");
    if (!llm.apiKey) {
      return NextResponse.json({ error: "API Key 未配置" }, { status: 500 });
    }
    if (!llm.baseUrl) {
      return NextResponse.json({ error: "Base URL 未配置" }, { status: 500 });
    }

    // 调用 chat completions 接口
    const res = await fetchLlmChat("text", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llm.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llm.model,
        messages: [
          {
            role: "system",
            content: `你是一位专业的时尚摄影 AI 提示词工程师。你的任务是将用户的简短风格描述扩展为详细、专业的图片生成提示词。

规则：
1. 输出必须是${getLlmLanguageName(request.headers.get("x-next-intl-locale"))}
2. 保留用户的核心意图
3. 补充摄影专业术语：光线、色调、构图、氛围、质感
4. 输出 2-4 句话，简洁有力，不超过 100 字
5. 不要加引号，不要加序号，直接输出优化后的提示词
6. 专注于视觉描述，不要输出解释性文字`,
          },
          {
            role: "user",
            content: `请优化这个图片生成风格提示词："${style.trim()}"`,
          },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[optimize-prompt] LLM error:", res.status, errText);
      // 降级到本地模板
      const fallback = expandStyleFallback(style);
      return NextResponse.json({ original: style, optimized: fallback, source: "fallback" });
    }

    const data = await res.json();
    const optimized = data.choices?.[0]?.message?.content?.trim();

    if (!optimized) {
      const fallback = expandStyleFallback(style);
      return NextResponse.json({ original: style, optimized: fallback, source: "fallback" });
    }

    return NextResponse.json({ original: style, optimized, source: "ai" });
  } catch (err: unknown) {
    console.error("[optimize-prompt] error:", err instanceof Error ? err.message : err);
    // 降级到本地模板
    const fallback = expandStyleFallback(style);
    return NextResponse.json({ original: style, optimized: fallback, source: "fallback" });
  }
}

// ---- 本地降级模板 ----
function expandStyleFallback(input: string): string {
  const STYLE_MAP: Record<string, string> = {
    "甜美": "甜美可爱风格，柔和粉色色调，自然光线，温暖氛围，皮肤质感细腻，表情自然甜美",
    "韩系": "韩系风格，奶白色调，柔和漫射光，干净背景，低饱和度色彩，温柔优雅气质",
    "小红书": "小红书热门风格，自然光线下拍摄，温暖色调，清晰皮肤纹理，时尚穿搭展示",
    "街拍": "街拍风格，城市街头背景，动态抓拍感，自然光影对比，潮流时尚感",
    "杂志": "时尚杂志封面风格，专业棚拍灯光，高对比度，锐利细节，时尚大片质感",
    "电商": "电商产品图风格，纯白背景，均匀柔光，清晰展示服装细节，专业商业摄影",
    "极简": "极简风格，干净背景，留白空间，低饱和度，高级质感，简约大气",
    "复古": "复古胶片风格，暖色调，轻微颗粒感，怀旧氛围，经典构图",
    "酷飒": "酷飒风格，冷色调，高对比度，锐利眼神，自信姿态，都市摩登感",
    "清纯": "清纯自然风格，自然光线，淡妆素颜感，清新明亮色调，青春活力",
  };

  for (const [keyword, expansion] of Object.entries(STYLE_MAP)) {
    if (input.includes(keyword)) return expansion;
  }

  return `${input}，高质量摄影，自然光线，清晰细节，专业质感`;
}
