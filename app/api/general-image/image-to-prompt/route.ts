import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 60;

const IMAGE_TO_PROMPT_TIMEOUT_MS = Number(process.env.LINGYA_ANALYZE_TIMEOUT_MS || 30000);

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`general-image-image-to-prompt:${auth.user.id}`, 30, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json().catch(() => ({}));
    const imageUrl = typeof body.image_url === "string" ? body.image_url.trim() : "";
    if (!/^https?:\/\//i.test(imageUrl) && !/^data:image\//i.test(imageUrl)) {
      return NextResponse.json({ error: "请先上传图片" }, { status: 400 });
    }

    const llm = await getLlmConfig("vision");
    if (!llm.apiKey || !llm.baseUrl) {
      return NextResponse.json({ error: "图片理解服务未配置，请稍后重试" }, { status: 503 });
    }

    const textPrompt = `你是专业图片内容描述师和文生图提示词工程师。请观察用户上传的图片，把画面内容反推成一段“纯文字文生图提示词”。

核心目标：
把图片里可见的信息转写成文字描述，让文生图模型即使完全看不到原图，也能按文字生成相似内容。

要求：
1. 输出中文为主，可保留少量英文摄影质量词。
2. 描述主体、外观、服装/产品、材质、颜色、姿态、背景、光线、构图、镜头距离、氛围和画质。
3. 如果图片有人物，要描述人物发型、配饰、服装、姿势和表情，但不要识别真实身份。
4. 如果图片是商品，要描述品类、结构、纹理、摆放方式和商业摄影风格。
5. 只能输出最终提示词本身，120-220字，不要解释，不要 Markdown，不要列表标题。
6. 禁止使用“参考图、参考图片、原图、上传图片、这张图片、图中、根据图片、保留图片”等依赖图片上下文的词。
7. 禁止写成“根据参考图片生成...”这种图生图指令；必须直接描述画面内容，例如“年轻女性模特身穿灰色无袖连衣裙，长发披肩...”`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_TO_PROMPT_TIMEOUT_MS);
    const res = await fetch(getChatCompletionsUrl(llm), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llm.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llm.model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: textPrompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        }],
        max_tokens: 600,
        temperature: 0.25,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const resText = await res.text();
    if (!res.ok) {
      console.error("[general-image/image-to-prompt] LLM error:", res.status, resText.slice(0, 500));
      return NextResponse.json({ error: "图片理解失败，请稍后重试", reason: `llm_http_${res.status}` }, { status: 502 });
    }

    const data = JSON.parse(resText) as Record<string, unknown>;
    const prompt = sanitizeImagePrompt(extractMessageText(data));
    if (!prompt) {
      return NextResponse.json({ error: "图片理解结果为空，请换一张图片重试" }, { status: 502 });
    }
    return NextResponse.json({ prompt, source: llm.provider });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "图片理解超时，请稍后重试", reason: "timeout" }, { status: 504 });
    }
    console.error("[general-image/image-to-prompt] error:", err);
    return NextResponse.json({ error: "图片转提示词失败" }, { status: 500 });
  }
}

function extractMessageText(data: Record<string, unknown>) {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          if (typeof record.text === "string") return record.text;
          if (typeof record.content === "string") return record.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function sanitizeImagePrompt(value: string) {
  const cleaned = value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^[-*#\s\d.、]+/gm, "")
    .replace(/根据(?:这张|该|上传的|用户上传的|参考)?(?:图片|图像|参考图|参考图片)(?:生成|创作|制作)?/g, "")
    .replace(/(?:参考图|参考图片|原图|上传图片|用户上传的图片|这张图片|该图片|这张图|该图|图中|画面中)/g, "")
    .replace(/保留图片(?:中的|里)?/g, "呈现")
    .replace(/保留(?:原图|图像|图片)(?:中的|里)?/g, "呈现")
    .replace(/\s+/g, " ")
    .replace(/^[，。；、\s]+/, "")
    .trim();

  if (!cleaned || /参考图|参考图片|根据.*图片|原图|上传图片/.test(cleaned)) return "";
  return cleaned.slice(0, 800);
}
