import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig, getLlmFallbackConfigs } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { logger } from "@/lib/logger";
import {
  inferProductSetProductProfile,
  normalizeProductSetProductProfile,
  normalizeProductSetVisualDirectorPlan,
  type ProductSetProductKind,
  type ProductSetApparelType,
  type ProductSetModelStrategy,
  type ProductSetProductProfile,
  type ProductSetSettings,
  type ProductSetStylePackId,
} from "@/lib/product-set";

const ANALYZE_TIMEOUT_MS = Number(process.env.PRODUCT_SET_ANALYZE_TIMEOUT_MS || 30000);

type ProductSetVisionAnalysis = {
  image_role?: string;
  image_role_confidence?: number;
  category?: {
    primary?: string;
    secondary?: string;
    category_confidence?: number;
  };
  product?: {
    name_guess?: string;
    main_object?: string;
    colors?: string[];
    material_guess?: string[];
    style_tags?: string[];
    visible_details?: string[];
    possible_selling_points?: string[];
    target_audience_guess?: string[];
    usage_scenarios?: string[];
  };
  human?: {
    has_human?: boolean;
    is_model_worn?: boolean;
    face_visible?: boolean;
    body_visible_range?: string;
    pose_description?: string;
    can_use_as_target_model?: boolean;
  };
  image_quality?: {
    is_clear?: boolean;
    product_complete?: boolean;
    product_occlusion_level?: string;
    background_clean?: boolean;
    has_watermark?: boolean;
    has_text?: boolean;
    has_logo?: boolean;
    lighting_good?: boolean;
    angle_quality?: string;
    can_cutout?: boolean;
    can_generate?: boolean;
    quality_score?: number;
  };
  generation_fit?: {
    suitable_tasks?: string[];
    recommended_style?: string;
    recommended_style_reason?: string;
    recommended_output_set?: string[];
    not_suitable_reason?: string;
  };
  visual_director?: {
    strategy_name?: string;
    style_strategy?: string;
    global_strategy?: ProductSetGlobalVisualStrategy;
    main_plan?: ProductSetDirectorModule[];
    details_plan?: ProductSetDirectorModule[];
    main_scripts?: ProductSetDirectorScreenScript[];
    details_scripts?: ProductSetDirectorScreenScript[];
    layout_principles?: string[];
    copy_strategy?: string;
    negative_layouts?: string[];
  };
  missing_info?: string[];
  next_step?: {
    action?: string;
    message_to_user?: string;
    can_continue_without_more_info?: boolean;
  };
  prompt_summary?: string;
  risk_notes?: string[];
};

type ProductSetDirectorModule = {
  module_key?: string;
  purpose?: string;
  layout?: string;
  copy_rule?: string;
};

type ProductSetGlobalVisualStrategy = {
  core_palette?: string;
  primary_color?: string;
  secondary_colors?: string[];
  accent_color?: string;
  color_temperature?: string;
  lighting?: string;
  typography?: string;
  texture_mood?: string;
};

type ProductSetDirectorScreenScript = {
  screen_no?: number;
  module_key?: string;
  title?: string;
  global_tone?: string;
  scene_design?: string;
  visual_composition?: string;
  copy_content?: string;
  layout_rules?: string;
  constraints?: string;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const limit = await checkRateLimit(`product-set-analyze:${auth.user.id}`, 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await request.json();
    const productImageUrls = Array.isArray(body.product_image_urls)
      ? body.product_image_urls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
      : [];
    if (!productImageUrls.length) return NextResponse.json({ product_info: "" });
    if (productImageUrls.length > 3) return NextResponse.json({ error: "商品图最多上传 3 张" }, { status: 400 });
    const requestedImageType = body.image_type === "main" ? "main" : "details";
    const requestedCountRaw = Number(body.gen_count);
    if (!Number.isFinite(requestedCountRaw) || requestedCountRaw <= 0) {
      return NextResponse.json({ error: "请先选择生成张数或详情页屏数" }, { status: 400 });
    }
    const requestedCount = Math.min(Math.max(Math.round(requestedCountRaw), 1), 8);
    const userProductInfo = typeof body.product_info === "string" ? body.product_info.trim().slice(0, 2000) : "";
    const referenceStyleInfo = typeof body.reference_style_info === "string" ? body.reference_style_info.trim().slice(0, 2000) : "";
    const targetPlatform = typeof body.target_platform === "string" && body.target_platform.trim()
      ? body.target_platform.trim().slice(0, 40)
      : "未明确";

    const imageContents = productImageUrls.map((url: string) => ({ type: "image_url", image_url: { url } }));
    const userInfoInstruction = userProductInfo
      ? `用户已填写的商品信息如下，请优先尊重并用它修正视觉识别，不要只依赖图片猜测：\n${userProductInfo}`
      : "用户没有填写商品信息。请根据上传图片帮用户写一份完整、中文、可用于生成商品套图的商品信息初稿；无法确定的字段写“未明确”，不要编造品牌、价格、认证、尺寸或功效。";
    const referenceStyleInstruction = referenceStyleInfo
      ? `用户选择了一个参考风格说明。它只是风格/版式/场景/配色/文案方向，不代表已经分析好的模板，也不代表本次商品的真实信息。请在分析时吸收其目标平台、视觉风格、统一场景、痛点、人群、配色和设计风格；如果其中的产品名称、卖点、参数与上传商品图冲突，以本次商品图和用户手填商品信息为准。\n${referenceStyleInfo}`
      : "用户没有选择额外参考风格。";
    const textPrompt = `你是专业电商商品图片分析 AI，服务于 AI 商品套图生成工具。

你的任务：
分析用户上传的 ${productImageUrls.length} 张图片。所有图片默认属于同一商品的多视角/局部素材，除非图片内容明显不是同一商品。请判断图片中的商品类型、商品特征、视觉质量、适合生成的电商图片类型，并返回结构化 JSON。

${userInfoInstruction}

${referenceStyleInstruction}

用户本次选择：
- 输出类型：${requestedImageType === "main" ? "商品主图/辅图" : "详情页"}
- 输出数量：${requestedCount} ${requestedImageType === "main" ? "张" : "屏"}
- 目标平台：${targetPlatform}

本次最重要的输出目标：
- 视觉总监方案必须严格按用户选择的 ${requestedCount} ${requestedImageType === "main" ? "张主图/辅图" : "屏详情页"} 来规划。
- ${requestedImageType === "main" ? "main_plan 和 main_scripts" : "details_plan 和 details_scripts"} 必须各输出 ${requestedCount} 个模块，顺序就是最终生成顺序。
- 非当前输出类型的 plan/scripts 可以为空数组，不要为了凑默认数量输出无关模块。
- 商品信息总结必须服务后续规划，覆盖目标平台、风格名称、视觉风格、整组统一场景、产品名称、核心卖点、用户痛点、适用人群、产品参数、设计风格、主题配色和用户需求原文。
- 所有面向用户展示的字段必须使用中文：商品名称、商品描述、目标受众、商品卖点、strategy_name、style_strategy、purpose、layout、copy_rule、title、scene_design、visual_composition、copy_content、layout_rules、constraints、style_tags、visible_details、possible_selling_points、target_audience_guess、usage_scenarios。
- 不要输出裸英文品名或英文方案标题。例如识别到 jacket，应写“夹克 / 户外夹克 / 反光连帽夹克”，不要只写 jacket；识别到 outdoor enthusiasts，应写“户外运动人群”。技术枚举字段 module_key 可以使用英文。

非常重要：
- 你只允许返回 JSON。
- 不要返回解释。
- 不要返回 Markdown。
- 不要返回多余文字。
- 如果无法判断，请使用 unknown，不要编造。
- 如果是推测，请降低 confidence。
- 不要凭空编造品牌名、价格、认证、专利、具体尺寸、销量、医学功效。
- 商品卖点必须来自可见结构、材质、功能、风格或使用场景。

========================
一、分析目标
========================

1. 图片角色
判断上传图片在电商生成流程中的用途。

可选值：
- product_source：商品来源图
- clothing_source：服装来源图
- target_model：目标模特图
- face_reference：人脸参考图
- pose_reference：姿势参考图
- background_reference：背景参考图
- style_reference：风格参考图
- detail_page_reference：详情页参考图
- logo_reference：品牌 Logo 图
- unknown：无法判断

2. 商品类目
判断图片中主要商品属于什么类目。

一级类目可选值：
- clothing：服装
- shoes：鞋靴
- bag：箱包
- jewelry：珠宝饰品
- accessory：配饰
- beauty：美妆
- skincare：护肤
- mother_baby：母婴
- toy：玩具
- home：家居
- electronics：数码电子
- food：食品
- sports：运动户外
- pet：宠物用品
- unknown：无法判断

二级类目请根据图片具体判断，例如：dress, jacket, hoodie, t_shirt, pants, skirt, kids_jacket, shoes, handbag, necklace, bottle, toy。

3. 商品属性
识别商品的颜色、材质、风格、可见细节、使用场景、目标人群、可能卖点。

4. 图片质量
判断图片是否清晰、商品是否完整、是否多角度、是否遮挡、背景是否干净、是否有水印/文字/logo/反光/严重压缩、是否适合抠图、是否适合生成套图。

5. 生成建议
判断图片适合生成什么内容。

可选值：
- product_main_image
- product_scene_image
- product_detail_image
- product_selling_point_image
- ai_try_on
- model_product_image
- detail_page
- social_media_post
- ad_creative
- not_suitable

6. 风格建议
根据商品自动推荐视觉风格。

可选值：
- smart_match
- minimalist
- korean_sweet
- french_commute
- outdoor_techwear
- xiaohongshu_lifestyle
- premium_brand
- fast_fashion
- amazon_clean
- taobao_hot_sale
- luxury_editorial
- mother_baby_soft
- tech_clean

7. AI 视觉总监方案
你需要像电商视觉总监一样，给出主图和详情页的最佳生成策略。
不要只给风格名，要给出模块搭配、每个模块的职责、排版方向和文字策略。

主图 module_key 可选：
- cover_main：封面主图
- white_background：白底主图
- catalog_model：模特/上身目录图
- lifestyle_scene：场景主图
- detail_closeup：细节特写
- multi_angle：多角度展示
- selling_point：卖点解析
- outfit_board：搭配建议
- campaign_poster：活动海报

详情页 module_key 可选：
- hero：首屏主视觉
- wearing_proof：上身/使用证明
- material_fit_detail：面料/版型/材质细节
- size_fit_guide：尺码/尺寸/试穿建议
- lifestyle_story：生活方式/种草场景
- outfit_pairing：搭配方案
- selling_points：核心卖点
- buyer_show：买家秀/真实感
- trust：信任背书
- tutorial：使用步骤

视觉总监规则：
- 不要使用默认张数；必须以用户选择的 ${requestedCount} ${requestedImageType === "main" ? "张" : "屏"} 为准。
- 如果用户选择主图：主图/辅图最多 ${requestedCount} 张，每张职责不同。
- 如果用户选择详情页：详情页正好 ${requestedCount} 屏，每屏职责不同。
- 每个模块必须有独立职责，不要连续两张都是相同模特海报。
- 如果是服装，详情页应优先包含：首屏、面料/版型、尺码/试穿、生活方式/搭配、上身证明。
- 如果没有具体尺码数据，尺码模块只能做测量位置和版型建议，不能编造数字尺码表。
- 文案策略必须强调：生图只放短大字，避免小字密集表格；长文案后续由系统叠加。
- global_strategy 负责定义全域主色、辅助色、点缀色、色温、光线、字体和质感。
- main_scripts/details_scripts 负责输出每张图/每屏的精细化执行脚本，逻辑参考：
  1. 全域统一色调：说明这一屏如何延续全域色调；
  2. 精细化场景：说明背景、道具、光线、人物/商品状态；
  3. 画面视觉：说明构图、镜头、主体比例和视觉重心；
  4. 文案内容：给出短标题/短标签，不写长段落；
  5. 排版规则：说明字体层级、留白、对齐、文字位置；
  6. 强制约束：说明本屏不能出现什么。

8. 缺失信息
判断为了生成更好的商品套图还缺少什么。

可选值：
- brand_name
- product_name
- selling_points
- product_size
- target_audience
- model_image
- face_reference
- background_reference
- logo
- no_missing

9. 下一步建议
给前端一个明确动作。

可选值：
- ready_to_generate
- ask_user_confirm_product_info
- ask_user_upload_more_angles
- ask_user_upload_model_image
- ask_user_choose_style
- ask_user_enter_selling_points
- image_not_suitable

========================
二、返回 JSON 结构
========================

请严格返回以下 JSON：

{
  "image_role": "",
  "image_role_confidence": 0,
  "category": {
    "primary": "",
    "secondary": "",
    "category_confidence": 0
  },
  "product": {
    "name_guess": "",
    "main_object": "",
    "colors": [],
    "material_guess": [],
    "style_tags": [],
    "visible_details": [],
    "possible_selling_points": [],
    "target_audience_guess": [],
    "usage_scenarios": []
  },
  "human": {
    "has_human": false,
    "is_model_worn": false,
    "face_visible": false,
    "body_visible_range": "",
    "pose_description": "",
    "can_use_as_target_model": false
  },
  "image_quality": {
    "is_clear": false,
    "product_complete": false,
    "product_occlusion_level": "",
    "background_clean": false,
    "has_watermark": false,
    "has_text": false,
    "has_logo": false,
    "lighting_good": false,
    "angle_quality": "",
    "can_cutout": false,
    "can_generate": false,
    "quality_score": 0
  },
  "generation_fit": {
    "suitable_tasks": [],
    "recommended_style": "",
    "recommended_style_reason": "",
    "recommended_output_set": [],
    "not_suitable_reason": ""
  },
  "visual_director": {
    "strategy_name": "",
    "style_strategy": "",
    "global_strategy": {
      "core_palette": "",
      "primary_color": "",
      "secondary_colors": [],
      "accent_color": "",
      "color_temperature": "",
      "lighting": "",
      "typography": "",
      "texture_mood": ""
    },
    "main_plan": [
      {
        "module_key": "",
        "purpose": "",
        "layout": "",
        "copy_rule": ""
      }
    ],
    "details_plan": [
      {
        "module_key": "",
        "purpose": "",
        "layout": "",
        "copy_rule": ""
      }
    ],
    "main_scripts": [
      {
        "screen_no": 1,
        "module_key": "",
        "title": "",
        "global_tone": "",
        "scene_design": "",
        "visual_composition": "",
        "copy_content": "",
        "layout_rules": "",
        "constraints": ""
      }
    ],
    "details_scripts": [
      {
        "screen_no": 1,
        "module_key": "",
        "title": "",
        "global_tone": "",
        "scene_design": "",
        "visual_composition": "",
        "copy_content": "",
        "layout_rules": "",
        "constraints": ""
      }
    ],
    "layout_principles": [],
    "copy_strategy": "",
    "negative_layouts": []
  },
  "missing_info": [],
  "next_step": {
    "action": "",
    "message_to_user": "",
    "can_continue_without_more_info": true
  },
  "prompt_summary": "",
  "risk_notes": []
}

========================
三、判断规则
========================

1. 如果图片里主要是单个商品，image_role 使用 product_source。
2. 如果图片里是衣服，并且衣服是主体，image_role 使用 clothing_source。
3. 如果图片里人物比商品更重要，且适合被换装，image_role 使用 target_model。
4. 如果图片主要是脸部，image_role 使用 face_reference。
5. 如果图片是完整详情页截图，image_role 使用 detail_page_reference。
6. 如果图片模糊、遮挡严重、商品不完整，can_generate 必须为 false。
7. 如果商品清晰但缺少卖点信息，can_generate 可以为 true，但 missing_info 需要包含 selling_points。
8. 不要凭空编造品牌名。
9. 不要输出医疗、安全、功效类绝对承诺。
10. 所有 confidence 范围必须是 0 到 1。
11. quality_score 范围必须是 0 到 10。`;

    const templateContext = { targetPlatform, originalText: [userProductInfo, referenceStyleInfo].filter(Boolean).join("\n\n"), imageCount: productImageUrls.length };
    const fallback = ensureProductInfoTemplate(localizeUserFacingText(userProductInfo), templateContext);
    const fallbackProfile = normalizeProductSetProductProfile(undefined, fallback);
    const configs = await getLlmFallbackConfigs("vision");
    if (!configs.length) {
      const primary = await getLlmConfig("vision");
      return NextResponse.json({
        product_info: fallback,
        product_profile: fallbackProfile,
        source: "fallback",
        reason: !primary.apiKey ? "missing_api_key" : "missing_base_url",
      });
    }

    const failures: string[] = [];
    for (const llm of configs) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
        const res = await fetch(getChatCompletionsUrl(llm), {
          method: "POST",
          headers: { Authorization: `Bearer ${llm.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: llm.model,
            messages: [{ role: "user", content: [{ type: "text", text: textPrompt }, ...imageContents] }],
            max_tokens: 3200,
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        const responseText = await res.text();
        if (!res.ok) {
          failures.push(`${llm.provider}_api_${res.status}`);
          logger.warn("[product-set/analyze] vision error:", llm.provider, res.status, responseText.slice(0, 300));
          continue;
        }

        let data: unknown;
        try {
          data = JSON.parse(responseText);
        } catch {
          failures.push(`${llm.provider}_invalid_json_response`);
          logger.warn("[product-set/analyze] invalid provider JSON:", llm.provider, responseText.slice(0, 300));
          continue;
        }

        const content = extractContent(data).trim();
        if (!content) {
          failures.push(`${llm.provider}_empty_content`);
          continue;
        }

        const parsed = parseAnalyzePayload(content);
        const normalizedAnalysis = normalizeVisionAnalysis(parsed.analysis);
        const analysis = normalizedAnalysis ? localizeVisionAnalysis(normalizedAnalysis) : undefined;
        const productInfo = parsed.productInfo
          ? ensureProductInfoTemplate(localizeUserFacingText(parsed.productInfo), templateContext)
          : analysis
            ? buildProductInfoFromAnalysis(analysis, productImageUrls.length, templateContext)
            : ensureProductInfoTemplate(localizeUserFacingText(content || fallback), templateContext);
        const productProfile = localizeProductProfile(parsed.productProfile
          ? normalizeProductSetProductProfile(parsed.productProfile, productInfo)
          : analysis
            ? buildProductProfileFromAnalysis(analysis, productInfo)
            : normalizeProductSetProductProfile(undefined, productInfo));
        const validation = validateAnalyzeResult(productInfo, productProfile);
        if (!validation.ok) {
          failures.push(`${llm.provider}_${validation.reason}`);
          logger.warn("[product-set/analyze] unusable analysis:", llm.provider, validation.reason, content.slice(0, 300));
          continue;
        }

        return NextResponse.json({
          product_info: productInfo,
          product_profile: productProfile,
          analysis,
          settings_patch: analysis ? buildSettingsPatchFromAnalysis(analysis) : undefined,
          source: "ai",
          provider: llm.provider,
          model: llm.model,
        });
      } catch (err: unknown) {
        const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "request_failed";
        failures.push(`${llm.provider}_${reason}`);
        logger.warn("[product-set/analyze] provider failed:", llm.provider, err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({
      product_info: fallback,
      product_profile: fallbackProfile,
      source: "fallback",
      reason: failures.length ? `all_failed:${failures.slice(0, 4).join(",")}` : "empty_llm_config",
    });
  } catch (err: unknown) {
    const message = err instanceof Error && err.name === "AbortError" ? "AI 分析超时" : "AI 分析失败";
    logger.warn("[product-set/analyze] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function extractContent(data: unknown) {
  const choices = (data as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        return typeof obj.text === "string" ? obj.text : "";
      }
      return "";
    }).filter(Boolean).join("\n");
  }
  return "";
}

function parseAnalyzePayload(content: string): { productInfo?: string; productProfile?: unknown; analysis?: unknown } {
  const text = content.trim();
  if (!text) return {};
  const jsonText = extractJsonObjectText(text)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const data = JSON.parse(jsonText) as Record<string, unknown>;
    return {
      productInfo: typeof data.product_info === "string" ? data.product_info : typeof data.productInfo === "string" ? data.productInfo : undefined,
      productProfile: data.product_profile || data.productProfile,
      analysis: data.analysis || data,
    };
  } catch {
    return {};
  }
}

function extractJsonObjectText(text: string) {
  const trimmed = text.trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

function validateAnalyzeResult(productInfo: string, productProfile: ReturnType<typeof normalizeProductSetProductProfile>) {
  const name = extractAnalyzeField(productInfo, ["产品名称", "商品名称"]);
  const description = extractAnalyzeField(productInfo, ["视觉风格", "整组图统一场景", "核心卖点", "商品描述"]);
  if (!name || /待分析|待确认|待识别|未识别/.test(name)) return { ok: false as const, reason: "placeholder_name" };
  if (!description || /用户上传了\s*\d+\s*张同一商品/.test(description)) return { ok: false as const, reason: "placeholder_description" };
  if (productProfile.confidence < 0.45) return { ok: false as const, reason: "low_confidence" };
  return { ok: true as const };
}

function extractAnalyzeField(text: string, labels: string[] | string) {
  const candidates = Array.isArray(labels) ? labels : [labels];
  for (const label of candidates) {
    const inlineMatch = text.match(new RegExp(`(?:\\*\\*)?${label}\\s*[:：](?:\\*\\*)?\\s*([^\\n]+)`));
    if (inlineMatch?.[1]?.trim()) return inlineMatch[1].trim();
    const blockMatch = text.match(new RegExp(`(?:^|\\n)#{1,3}\\s*${label}\\s*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s|\\n(?:\\*\\*)?[^\\n:：]{2,20}(?:\\*\\*)?\\s*[:：]|$)`));
    if (blockMatch?.[1]?.trim()) return blockMatch[1].trim();
  }
  return "";
}

function normalizeVisionAnalysis(value: unknown): ProductSetVisionAnalysis | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as ProductSetVisionAnalysis;
  const primary = safeString(input.category?.primary);
  const secondary = safeString(input.category?.secondary);
  const nameGuess = safeString(input.product?.name_guess);
  const mainObject = safeString(input.product?.main_object);
  if (!primary && !secondary && !nameGuess && !mainObject) return undefined;

  return {
    image_role: safeString(input.image_role) || "unknown",
    image_role_confidence: clamp01(input.image_role_confidence),
    category: {
      primary: primary || "unknown",
      secondary: secondary || "unknown",
      category_confidence: clamp01(input.category?.category_confidence),
    },
    product: {
      name_guess: nameGuess || mainObject || "unknown",
      main_object: mainObject || nameGuess || "unknown",
      colors: safeStringArray(input.product?.colors, 8),
      material_guess: safeStringArray(input.product?.material_guess, 8),
      style_tags: safeStringArray(input.product?.style_tags, 10),
      visible_details: safeStringArray(input.product?.visible_details, 12),
      possible_selling_points: safeStringArray(input.product?.possible_selling_points, 8),
      target_audience_guess: safeStringArray(input.product?.target_audience_guess, 8),
      usage_scenarios: safeStringArray(input.product?.usage_scenarios, 8),
    },
    human: {
      has_human: Boolean(input.human?.has_human),
      is_model_worn: Boolean(input.human?.is_model_worn),
      face_visible: Boolean(input.human?.face_visible),
      body_visible_range: safeString(input.human?.body_visible_range),
      pose_description: safeString(input.human?.pose_description),
      can_use_as_target_model: Boolean(input.human?.can_use_as_target_model),
    },
    image_quality: {
      is_clear: Boolean(input.image_quality?.is_clear),
      product_complete: Boolean(input.image_quality?.product_complete),
      product_occlusion_level: safeString(input.image_quality?.product_occlusion_level),
      background_clean: Boolean(input.image_quality?.background_clean),
      has_watermark: Boolean(input.image_quality?.has_watermark),
      has_text: Boolean(input.image_quality?.has_text),
      has_logo: Boolean(input.image_quality?.has_logo),
      lighting_good: Boolean(input.image_quality?.lighting_good),
      angle_quality: safeString(input.image_quality?.angle_quality),
      can_cutout: Boolean(input.image_quality?.can_cutout),
      can_generate: Boolean(input.image_quality?.can_generate),
      quality_score: clampScore(input.image_quality?.quality_score),
    },
    generation_fit: {
      suitable_tasks: safeStringArray(input.generation_fit?.suitable_tasks, 10),
      recommended_style: safeString(input.generation_fit?.recommended_style) || "smart_match",
      recommended_style_reason: safeString(input.generation_fit?.recommended_style_reason),
      recommended_output_set: safeStringArray(input.generation_fit?.recommended_output_set, 10),
      not_suitable_reason: safeString(input.generation_fit?.not_suitable_reason),
    },
    visual_director: normalizeVisualDirector(input.visual_director),
    missing_info: safeStringArray(input.missing_info, 10),
    next_step: {
      action: safeString(input.next_step?.action) || "ask_user_confirm_product_info",
      message_to_user: safeString(input.next_step?.message_to_user),
      can_continue_without_more_info: input.next_step?.can_continue_without_more_info !== false,
    },
    prompt_summary: safeString(input.prompt_summary),
    risk_notes: safeStringArray(input.risk_notes, 8),
  };
}

function normalizeVisualDirector(value: ProductSetVisionAnalysis["visual_director"]): ProductSetVisionAnalysis["visual_director"] {
  const input = value && typeof value === "object" ? value : {};
  return {
    strategy_name: safeString(input.strategy_name, 80),
    style_strategy: safeString(input.style_strategy, 260),
    global_strategy: normalizeGlobalVisualStrategy(input.global_strategy),
    main_plan: normalizeDirectorModules(input.main_plan, 8),
    details_plan: normalizeDirectorModules(input.details_plan, 8),
    main_scripts: normalizeDirectorScreenScripts(input.main_scripts, 8),
    details_scripts: normalizeDirectorScreenScripts(input.details_scripts, 8),
    layout_principles: safeStringArray(input.layout_principles, 8),
    copy_strategy: safeString(input.copy_strategy, 260),
    negative_layouts: safeStringArray(input.negative_layouts, 8),
  };
}

function normalizeGlobalVisualStrategy(value: unknown): ProductSetGlobalVisualStrategy {
  const input = value && typeof value === "object" ? value as ProductSetGlobalVisualStrategy : {};
  return {
    core_palette: safeString(input.core_palette, 80),
    primary_color: safeString(input.primary_color, 80),
    secondary_colors: safeStringArray(input.secondary_colors, 5),
    accent_color: safeString(input.accent_color, 80),
    color_temperature: safeString(input.color_temperature, 80),
    lighting: safeString(input.lighting, 160),
    typography: safeString(input.typography, 120),
    texture_mood: safeString(input.texture_mood, 160),
  };
}

function normalizeDirectorModules(value: unknown, maxItems: number): ProductSetDirectorModule[] {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item): ProductSetDirectorModule | null => {
      if (!item || typeof item !== "object") return null;
      const input = item as ProductSetDirectorModule;
      const moduleKey = safeString(input.module_key, 60);
      if (!moduleKey) return null;
      return {
        module_key: moduleKey,
        purpose: safeString(input.purpose, 120),
        layout: safeString(input.layout, 160),
        copy_rule: safeString(input.copy_rule, 120),
      };
    })
    .filter((item): item is ProductSetDirectorModule => Boolean(item))
    .slice(0, maxItems);
}

function normalizeDirectorScreenScripts(value: unknown, maxItems: number): ProductSetDirectorScreenScript[] {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item): ProductSetDirectorScreenScript | null => {
      if (!item || typeof item !== "object") return null;
      const input = item as ProductSetDirectorScreenScript;
      const moduleKey = safeString(input.module_key, 60);
      const title = safeString(input.title, 80);
      if (!moduleKey && !title) return null;
      return {
        screen_no: normalizeScreenNo(input.screen_no),
        module_key: moduleKey,
        title,
        global_tone: safeString(input.global_tone, 180),
        scene_design: safeString(input.scene_design, 320),
        visual_composition: safeString(input.visual_composition, 260),
        copy_content: safeString(input.copy_content, 220),
        layout_rules: safeString(input.layout_rules, 220),
        constraints: safeString(input.constraints, 220),
      };
    })
    .filter((item): item is ProductSetDirectorScreenScript => Boolean(item))
    .slice(0, maxItems);
}

const USER_FACING_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bThe Ultimate Visibility Jacket\b/gi, "高可视机能夹克"],
  [/\bCreate visually appealing first impression\b/gi, "建立第一眼主视觉"],
  [/\bDetail the material and fit\b/gi, "展示材质与版型"],
  [/\bProvide sizing suggestions\b/gi, "提供尺码和穿着建议"],
  [/\bShow how the jacket fits into outdoor activities\b/gi, "展示户外穿着场景"],
  [/\bDemonstrate the jacket being worn\b/gi, "展示上身穿着效果"],
  [/\boutdoor enthusiasts\b/gi, "户外运动人群"],
  [/\bworkers in low-visibility conditions\b/gi, "低能见度工作人群"],
  [/\bhigh visibility\b/gi, "高可视性"],
  [/\bweather-resistant\b/gi, "防风防泼水"],
  [/\bfunctional pockets\b/gi, "多功能口袋"],
  [/\breflective stripes\b/gi, "反光条"],
  [/\bzippered pockets\b/gi, "拉链口袋"],
  [/\bmaterial and fit\b/gi, "材质与版型"],
  [/\bsizing suggestions\b/gi, "尺码建议"],
  [/\bfunctional and sporty\b/gi, "功能运动风"],
  [/\bsportswear\b/gi, "运动服饰"],
  [/\bapparel\b/gi, "服装"],
  [/\bouterwear\b/gi, "外套"],
  [/\boutdoor\b/gi, "户外"],
  [/\bsport\b/gi, "运动"],
  [/\byellow\b/gi, "黄色"],
  [/\bblack\b/gi, "黑色"],
  [/\bhood\b/gi, "连帽"],
  [/\bjacket\b/gi, "夹克"],
];

function localizeUserFacingText(value: string) {
  let text = value;
  for (const [pattern, replacement] of USER_FACING_TEXT_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text
    .replace(/\s+([，。；、])/g, "$1")
    .replace(/([，。；、])\s+/g, "$1")
    .trim();
}

function localizeStringArray(value?: string[]) {
  return (value || []).map(localizeUserFacingText).filter(Boolean);
}

function localizeVisionAnalysis(analysis: ProductSetVisionAnalysis): ProductSetVisionAnalysis {
  return {
    ...analysis,
    category: analysis.category ? {
      ...analysis.category,
      secondary: localizeUserFacingText(analysis.category.secondary || ""),
    } : analysis.category,
    product: analysis.product ? {
      ...analysis.product,
      name_guess: localizeUserFacingText(analysis.product.name_guess || ""),
      main_object: localizeUserFacingText(analysis.product.main_object || ""),
      colors: localizeStringArray(analysis.product.colors),
      material_guess: localizeStringArray(analysis.product.material_guess),
      style_tags: localizeStringArray(analysis.product.style_tags),
      visible_details: localizeStringArray(analysis.product.visible_details),
      possible_selling_points: localizeStringArray(analysis.product.possible_selling_points),
      target_audience_guess: localizeStringArray(analysis.product.target_audience_guess),
      usage_scenarios: localizeStringArray(analysis.product.usage_scenarios),
    } : analysis.product,
    generation_fit: analysis.generation_fit ? {
      ...analysis.generation_fit,
      recommended_style_reason: localizeUserFacingText(analysis.generation_fit.recommended_style_reason || ""),
      recommended_output_set: localizeStringArray(analysis.generation_fit.recommended_output_set),
      not_suitable_reason: localizeUserFacingText(analysis.generation_fit.not_suitable_reason || ""),
    } : analysis.generation_fit,
    visual_director: analysis.visual_director ? {
      ...analysis.visual_director,
      strategy_name: localizeUserFacingText(analysis.visual_director.strategy_name || ""),
      style_strategy: localizeUserFacingText(analysis.visual_director.style_strategy || ""),
      global_strategy: analysis.visual_director.global_strategy ? {
        ...analysis.visual_director.global_strategy,
        core_palette: localizeUserFacingText(analysis.visual_director.global_strategy.core_palette || ""),
        primary_color: localizeUserFacingText(analysis.visual_director.global_strategy.primary_color || ""),
        secondary_colors: localizeStringArray(analysis.visual_director.global_strategy.secondary_colors),
        accent_color: localizeUserFacingText(analysis.visual_director.global_strategy.accent_color || ""),
        color_temperature: localizeUserFacingText(analysis.visual_director.global_strategy.color_temperature || ""),
        lighting: localizeUserFacingText(analysis.visual_director.global_strategy.lighting || ""),
        typography: localizeUserFacingText(analysis.visual_director.global_strategy.typography || ""),
        texture_mood: localizeUserFacingText(analysis.visual_director.global_strategy.texture_mood || ""),
      } : analysis.visual_director.global_strategy,
      main_plan: localizeDirectorModules(analysis.visual_director.main_plan),
      details_plan: localizeDirectorModules(analysis.visual_director.details_plan),
      main_scripts: localizeDirectorScripts(analysis.visual_director.main_scripts),
      details_scripts: localizeDirectorScripts(analysis.visual_director.details_scripts),
      layout_principles: localizeStringArray(analysis.visual_director.layout_principles),
      copy_strategy: localizeUserFacingText(analysis.visual_director.copy_strategy || ""),
      negative_layouts: localizeStringArray(analysis.visual_director.negative_layouts),
    } : analysis.visual_director,
    next_step: analysis.next_step ? {
      ...analysis.next_step,
      message_to_user: localizeUserFacingText(analysis.next_step.message_to_user || ""),
    } : analysis.next_step,
    prompt_summary: localizeUserFacingText(analysis.prompt_summary || ""),
    risk_notes: localizeStringArray(analysis.risk_notes),
  };
}

function localizeDirectorModules(value?: ProductSetDirectorModule[]) {
  return (value || []).map((item) => ({
    ...item,
    purpose: localizeUserFacingText(item.purpose || ""),
    layout: localizeUserFacingText(item.layout || ""),
    copy_rule: localizeUserFacingText(item.copy_rule || ""),
  }));
}

function localizeDirectorScripts(value?: ProductSetDirectorScreenScript[]) {
  return (value || []).map((item) => ({
    ...item,
    title: localizeUserFacingText(item.title || ""),
    global_tone: localizeUserFacingText(item.global_tone || ""),
    scene_design: localizeUserFacingText(item.scene_design || ""),
    visual_composition: localizeUserFacingText(item.visual_composition || ""),
    copy_content: localizeUserFacingText(item.copy_content || ""),
    layout_rules: localizeUserFacingText(item.layout_rules || ""),
    constraints: localizeUserFacingText(item.constraints || ""),
  }));
}

function localizeProductProfile(profile: ProductSetProductProfile): ProductSetProductProfile {
  return {
    ...profile,
    displayName: localizeUserFacingText(profile.displayName),
    modelBrief: localizeUserFacingText(profile.modelBrief),
    planningNotes: localizeStringArray(profile.planningNotes),
    visualKeywords: localizeStringArray(profile.visualKeywords),
  };
}

type ProductInfoTemplateContext = {
  targetPlatform?: string;
  originalText?: string;
  imageCount?: number;
};

function buildProductInfoFromAnalysis(analysis: ProductSetVisionAnalysis, imageCount: number, context: ProductInfoTemplateContext = {}) {
  const product = analysis.product || {};
  const category = analysis.category || {};
  const director = analysis.visual_director || {};
  const globalStrategy = director.global_strategy || {};
  const name = firstUseful(product.name_guess, product.main_object, category.secondary, "待确认商品");
  const colors = listText(product.colors);
  const materials = listText(product.material_guess);
  const details = listText(product.visible_details);
  const styles = listText(product.style_tags);
  const scenarios = listText(product.usage_scenarios);
  const audience = product.target_audience_guess?.length
    ? product.target_audience_guess.join("、")
    : inferAudienceFromAnalysis(analysis);
  const sellingPoints = (product.possible_selling_points?.length ? product.possible_selling_points : [
    product.visible_details?.[0],
    product.material_guess?.[0],
    product.style_tags?.[0],
    analysis.generation_fit?.recommended_style_reason,
  ]).filter((item): item is string => Boolean(item)).slice(0, 5);
  const visualStyle = firstUseful(
    director.style_strategy,
    analysis.generation_fit?.recommended_style_reason,
    styles ? `围绕${styles}建立统一视觉调性，突出商品质感、结构和可购买理由。` : undefined,
    "采用清晰高级的电商视觉，突出商品主体、材质质感和核心卖点。"
  );
  const unifiedScene = [
    globalStrategy.lighting,
    globalStrategy.texture_mood,
    globalStrategy.color_temperature,
    scenarios ? `适配${scenarios}等使用场景` : "",
  ].filter(Boolean).join("，") || `基于 ${imageCount} 张商品图建立统一场景，保持商品颜色、结构、材质和品牌识别一致。`;
  const productParams = [
    `材质：${materials || "未明确"}`,
    "尺寸：未明确",
    `颜色：${colors || "未明确"}`,
    `功能：${scenarios || sellingPoints[0] || details || "展示商品外观、细节与使用价值"}`,
  ].join("；");

  return formatProductInfoTemplate({
    targetPlatform: context.targetPlatform,
    styleName: firstUseful(director.strategy_name, analysis.generation_fit?.recommended_style, styles ? `${styles}风` : undefined, "智能电商风"),
    visualStyle,
    unifiedScene,
    productName: name,
    coreSellingPoint: sellingPoints.length ? sellingPoints.join("；") : details || "突出商品外观、材质、结构和使用价值。",
    painPoints: buildPainPointsFromAnalysis(analysis, sellingPoints),
    audience: audience || "面向该商品品类的电商目标用户。",
    productParams,
    designStyle: styles || firstUseful(analysis.generation_fit?.recommended_style, director.strategy_name, "高级/清晰/电商转化"),
    primaryColor: firstUseful(globalStrategy.primary_color, colors?.split("、")[0], "未明确"),
    secondaryColor: firstUseful(globalStrategy.secondary_colors?.[0], colors?.split("、")[1], "未明确"),
    accentColor: firstUseful(globalStrategy.accent_color, "未明确"),
    originalText: context.originalText,
  });
}

function buildProductProfileFromAnalysis(analysis: ProductSetVisionAnalysis, productInfo: string): ProductSetProductProfile {
  const inferred = inferProductSetProductProfile(productInfo);
  const kind = mapAnalysisKind(analysis);
  const apparelType = mapAnalysisApparelType(analysis);
  const isApparel = kind === "apparel" || kind === "footwear" || apparelType !== "general";
  const needsModel = isApparel && analysis.human?.can_use_as_target_model !== true;
  const modelStrategy: ProductSetModelStrategy = isApparel
    ? analysis.category?.secondary?.includes("intimate") || apparelType === "intimate" || apparelType === "swimwear"
      ? "recommended"
      : "recommended"
    : "none";
  const displayName = firstUseful(
    analysis.product?.name_guess,
    analysis.product?.main_object,
    toDisplayCategory(analysis.category?.secondary),
    inferred.displayName
  );
  const confidence = Math.max(
    clamp01(analysis.category?.category_confidence),
    clamp01(analysis.image_role_confidence),
    inferred.confidence
  );

  return normalizeProductSetProductProfile({
    kind,
    apparelType,
    displayName,
    confidence,
    isApparel,
    needsModel,
    modelStrategy,
    modelBrief: buildModelBriefFromAnalysis(analysis, apparelType, isApparel),
    recommendedMainPlanId: isApparel ? "ai-main" : inferred.recommendedMainPlanId,
    recommendedDetailsPlanId: isApparel ? "ai-details" : inferred.recommendedDetailsPlanId,
    planningNotes: [
      analysis.visual_director?.strategy_name ? `AI视觉总监：${analysis.visual_director.strategy_name}` : "",
      analysis.visual_director?.style_strategy,
      analysis.visual_director?.copy_strategy,
      analysis.next_step?.message_to_user,
      analysis.generation_fit?.recommended_style_reason,
      ...(analysis.generation_fit?.recommended_output_set || []).slice(0, 3),
    ].filter((item): item is string => Boolean(item)).slice(0, 5),
    visualKeywords: [
      ...(analysis.product?.style_tags || []),
      ...(analysis.product?.colors || []),
      ...(analysis.product?.visible_details || []),
    ].slice(0, 8),
  }, productInfo);
}

function buildSettingsPatchFromAnalysis(analysis: ProductSetVisionAnalysis): Partial<ProductSetSettings> {
  const style = String(analysis.generation_fit?.recommended_style || "");
  const stylePackId = mapRecommendedStyle(style);
  const directorBrief = buildVisualDirectorSettingsBrief(analysis);
  const visualDirectorPlan = normalizeProductSetVisualDirectorPlan(analysis.visual_director);
  return {
    ...(stylePackId === "auto" ? {} : { stylePackId }),
    ...(directorBrief ? { visualDirectorScript: directorBrief } : {}),
    ...(visualDirectorPlan ? { visualDirectorPlan } : {}),
  };
}

function buildVisualDirectorSettingsBrief(analysis: ProductSetVisionAnalysis) {
  const director = analysis.visual_director;
  if (!director) return "";
  const global = director.global_strategy;
  const globalLine = global ? [
    global.core_palette ? `核心调性${global.core_palette}` : "",
    global.primary_color ? `主色${global.primary_color}` : "",
    global.secondary_colors?.length ? `辅色${global.secondary_colors.join("、")}` : "",
    global.accent_color ? `点缀${global.accent_color}` : "",
    global.color_temperature ? `色温${global.color_temperature}` : "",
    global.lighting ? `光线${global.lighting}` : "",
    global.typography ? `字体${global.typography}` : "",
    global.texture_mood ? `质感${global.texture_mood}` : "",
  ].filter(Boolean).join("；") : "";
  const mainPlan = director.main_plan?.length
    ? `主图模块：${director.main_plan.map(formatDirectorModule).join(" / ")}`
    : "";
  const detailsPlan = director.details_plan?.length
    ? `详情页模块：${director.details_plan.map(formatDirectorModule).join(" / ")}`
    : "";
  const mainScripts = director.main_scripts?.length
    ? `主图执行脚本：${director.main_scripts.map(formatDirectorScreenScript).join(" || ")}`
    : "";
  const detailsScripts = director.details_scripts?.length
    ? `详情页执行脚本：${director.details_scripts.map(formatDirectorScreenScript).join(" || ")}`
    : "";
  return [
    director.strategy_name ? `AI视觉总监方案：${director.strategy_name}` : "",
    globalLine ? `全域视觉策略：${globalLine}` : "",
    director.style_strategy ? `风格策略：${director.style_strategy}` : "",
    mainPlan,
    detailsPlan,
    mainScripts,
    detailsScripts,
    director.copy_strategy ? `文案策略：${director.copy_strategy}` : "",
    director.layout_principles?.length ? `排版原则：${director.layout_principles.slice(0, 4).join("；")}` : "",
    director.negative_layouts?.length ? `避免：${director.negative_layouts.slice(0, 4).join("；")}` : "",
  ].filter(Boolean).join("\n").slice(0, 3000);
}

function formatDirectorModule(module: ProductSetDirectorModule) {
  return [module.module_key, module.purpose, module.layout].filter(Boolean).join("-");
}

function formatDirectorScreenScript(script: ProductSetDirectorScreenScript) {
  return [
    `第${script.screen_no || ""}屏`,
    script.module_key,
    script.title,
    script.global_tone ? `色调:${script.global_tone}` : "",
    script.scene_design ? `场景:${script.scene_design}` : "",
    script.visual_composition ? `画面:${script.visual_composition}` : "",
    script.copy_content ? `文案:${script.copy_content}` : "",
    script.layout_rules ? `排版:${script.layout_rules}` : "",
    script.constraints ? `约束:${script.constraints}` : "",
  ].filter(Boolean).join(" ");
}

function mapAnalysisKind(analysis: ProductSetVisionAnalysis): ProductSetProductKind {
  const primary = String(analysis.category?.primary || "").toLowerCase();
  if (primary === "clothing" || primary === "sports" || /jacket|hoodie|dress|shirt|pants|skirt|coat|clothing/.test(String(analysis.category?.secondary || "").toLowerCase())) return "apparel";
  if (primary === "shoes") return "footwear";
  if (primary === "bag") return "bag";
  if (primary === "jewelry") return "accessory";
  if (primary === "accessory") return "accessory";
  if (primary === "beauty" || primary === "skincare") return "beauty";
  if (primary === "electronics") return "electronics";
  if (primary === "home") return "home";
  if (primary === "toy" || primary === "mother_baby" || primary === "pet") return "toy";
  if (primary === "food") return "food";
  return "general";
}

function mapAnalysisApparelType(analysis: ProductSetVisionAnalysis): ProductSetApparelType {
  const text = [
    analysis.category?.secondary,
    analysis.product?.name_guess,
    analysis.product?.main_object,
    ...(analysis.product?.style_tags || []),
    ...(analysis.product?.target_audience_guess || []),
  ].join(" ").toLowerCase();
  if (/kid|child|children|baby|童|儿童|宝宝|母婴/.test(text)) return "kidswear";
  if (/swim|bikini|泳/.test(text)) return "swimwear";
  if (/intimate|bra|underwear|内衣|文胸/.test(text)) return "intimate";
  if (/sport|outdoor|techwear|冲锋|户外|运动|瑜伽|骑行/.test(text)) return "sportswear";
  if (/jacket|coat|hoodie|outerwear|外套|夹克|连帽|卫衣|大衣|风衣/.test(text)) return "outerwear";
  if (/men|male|男/.test(text)) return "menswear";
  if (/women|female|lady|girl|dress|skirt|女|裙/.test(text)) return "womenswear";
  return mapAnalysisKind(analysis) === "apparel" ? "general" : "general";
}

function mapRecommendedStyle(value: string): ProductSetStylePackId {
  const style = value.toLowerCase();
  if (style === "korean_sweet") return "korean_sweet";
  if (style === "french_commute") return "french_commute";
  if (style === "outdoor_techwear") return "outdoor_utility";
  if (style === "xiaohongshu_lifestyle") return "xiaohongshu_girl";
  if (style === "fast_fashion") return "shein_fastfashion";
  if (style === "premium_brand" || style === "luxury_editorial" || style === "minimalist") return "minimal_indie";
  return "auto";
}

function buildModelBriefFromAnalysis(analysis: ProductSetVisionAnalysis, apparelType: ProductSetApparelType, isApparel: boolean) {
  if (!isApparel) return "不使用真人模特，优先商品白底、场景、尺寸、材质和使用说明。";
  if (apparelType === "kidswear") return "适合使用年龄合适的儿童模特或童装平铺/假模特展示，场景明亮安全，不成人化。";
  if (apparelType === "intimate" || apparelType === "swimwear") return "使用成年模特或保守商业目录式展示，非情色、非挑逗，避免卧室暗示和未成年感。";
  if (apparelType === "sportswear" || apparelType === "outerwear") return "使用成年模特，姿势自然有行动感，突出防护、版型、层次和真实穿着效果。";
  const audience = analysis.product?.target_audience_guess?.join("、");
  return `使用成年模特，姿势自然，突出上身版型、材质垂感和穿搭氛围${audience ? `，目标人群参考：${audience}` : ""}。`;
}

function inferAudienceFromAnalysis(analysis: ProductSetVisionAnalysis) {
  const apparelType = mapAnalysisApparelType(analysis);
  if (apparelType === "kidswear") return "儿童及其家长，适合关注舒适、安全和日常穿着的家庭用户。";
  if (apparelType === "womenswear") return "女性消费者，适合关注版型、风格、舒适度和穿搭场景的电商用户。";
  if (apparelType === "menswear") return "男性消费者，适合关注版型、功能和日常搭配的电商用户。";
  return "面向该商品品类的电商目标用户。";
}

function toDisplayCategory(value?: string) {
  return safeString(value).replace(/_/g, " ") || "";
}

function safeString(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeStringArray(value: unknown, maxItems: number) {
  return Array.isArray(value)
    ? value.map((item) => safeString(item, 80)).filter(Boolean).slice(0, maxItems)
    : [];
}

function clamp01(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.min(Math.max(numberValue, 0), 1) : 0;
}

function clampScore(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.min(Math.max(numberValue, 0), 10) : 0;
}

function normalizeScreenNo(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return undefined;
  return Math.min(Math.floor(numberValue), 20);
}

function listText(value?: string[]) {
  return value?.filter(Boolean).slice(0, 6).join("、") || "";
}

function firstUseful(...values: Array<string | undefined>) {
  return values.find((value) => value && value !== "unknown") || "";
}

function ensureProductInfoTemplate(value: string, context: ProductInfoTemplateContext = {}) {
  const text = value.trim();
  const description = extractFlexibleInfoField(text, ["视觉风格", "商品描述", "描述", "商品信息", "产品描述"]) || text || "根据上传商品图识别商品外观、材质、结构和使用方式。";
  const sellingPoints = extractFlexibleInfoField(text, ["核心卖点", "商品卖点", "卖点", "优势"]) || "多视角商品图可提升外观可信度；清晰展示材质与结构细节；适合生成主图、辅图与详情页视觉。";

  return formatProductInfoTemplate({
    targetPlatform: extractFlexibleInfoField(text, ["目标平台", "平台"]) || context.targetPlatform,
    styleName: extractFlexibleInfoField(text, ["风格名称", "风格名"]) || "智能电商风",
    visualStyle: description,
    unifiedScene: extractFlexibleInfoField(text, ["整组图统一场景", "统一场景", "场景"]) || "统一使用干净、专业、适合电商转化的场景，保持商品主体颜色、结构和材质一致。",
    productName: extractFlexibleInfoField(text, ["产品名称", "商品名称", "品名", "商品名", "名称"]) || inferFreeTextProductName(text) || "待确认商品",
    coreSellingPoint: sellingPoints,
    painPoints: normalizePainPoints(extractFlexibleInfoField(text, ["用户痛点", "痛点"])),
    audience: extractFlexibleInfoField(text, ["适用人群", "目标受众", "目标人群", "受众", "人群"]) || "面向需要该类商品功能与审美价值的电商用户，具体人群需结合商品品类进一步确认。",
    productParams: extractFlexibleInfoField(text, ["产品参数", "商品参数", "参数"]) || "材质：未明确；尺寸：未明确；颜色：未明确；功能：结合商品图和用户信息判断。",
    designStyle: extractFlexibleInfoField(text, ["设计风格", "风格"]) || "高级/清晰/电商转化",
    primaryColor: extractFlexibleInfoField(text, ["主色调"]) || "未明确",
    secondaryColor: extractFlexibleInfoField(text, ["辅助色"]) || "未明确",
    accentColor: extractFlexibleInfoField(text, ["点缀色"]) || "未明确",
    originalText: extractFlexibleInfoField(text, ["用户需求原文"]) || context.originalText || text || "无",
  });
}

function formatProductInfoTemplate({
  targetPlatform,
  styleName,
  visualStyle,
  unifiedScene,
  productName,
  coreSellingPoint,
  painPoints,
  audience,
  productParams,
  designStyle,
  primaryColor,
  secondaryColor,
  accentColor,
  originalText,
}: {
  targetPlatform?: string;
  styleName?: string;
  visualStyle?: string;
  unifiedScene?: string;
  productName?: string;
  coreSellingPoint?: string;
  painPoints?: string[];
  audience?: string;
  productParams?: string;
  designStyle?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  originalText?: string;
}) {
  const normalizedPainPoints = (painPoints?.length ? painPoints : [
    "用户难以快速判断商品质感、版型或核心价值",
    "普通商品图缺少统一视觉场景，转化说服力不足",
    "卖点展示不够清晰，详情页容易变成信息堆叠",
  ]).slice(0, 3);

  return `**目标平台：** ${targetPlatform || "未明确"}

**风格名称：** ${styleName || "智能电商风"}

## 视觉风格
${visualStyle || "采用清晰高级的电商视觉，突出商品主体、材质质感和核心卖点。"}

## 整组图统一场景
${unifiedScene || "统一使用干净、专业、适合电商转化的场景，保持商品主体颜色、结构和材质一致。"}

## 产品信息
**产品名称：** ${productName || "待确认商品"}

**核心卖点：** ${coreSellingPoint || "突出商品外观、材质、结构和使用价值。"}

## 用户痛点
${normalizedPainPoints.map((item, index) => `- [痛点${index + 1}：${item.replace(/^[痛点\d：:\-\s]+/, "")}]`).join("\n")}

**适用人群：** ${audience || "面向该商品品类的电商目标用户。"}

## 产品参数
${productParams || "材质：未明确；尺寸：未明确；颜色：未明确；功能：结合商品图和用户信息判断。"}

## 设计风格
${designStyle || "高级/清晰/电商转化"}

## 主题配色
- **主色调：** ${primaryColor || "未明确"}
- **辅助色：** ${secondaryColor || "未明确"}
- **点缀色：** ${accentColor || "未明确"}

## 用户需求原文
${originalText || "无"}`.slice(0, 2000);
}

function buildPainPointsFromAnalysis(analysis: ProductSetVisionAnalysis, sellingPoints: string[]) {
  const details = analysis.product?.visible_details || [];
  const scenarios = analysis.product?.usage_scenarios || [];
  const points = [
    sellingPoints[0] ? `用户需要快速理解${sellingPoints[0]}，否则容易忽略商品价值` : "",
    details[0] ? `关键细节如${details[0]}如果展示不足，会影响购买信任` : "",
    scenarios[0] ? `${scenarios[0]}场景下需要更清楚的使用效果和搭配说明` : "",
  ].filter(Boolean);
  return points.length ? points : undefined;
}

function normalizePainPoints(value: string) {
  return value
    .replace(/^\[|\]$/g, "")
    .split(/\n|；|;|、/)
    .map((item) => item.replace(/^[-*\s]+/, "").replace(/^\[?痛点\d+[：:]/, "").replace(/\]?$/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function extractFlexibleInfoField(text: string, labels: string[]) {
  for (const label of labels) {
    const inlineMatch = text.match(new RegExp(`(?:\\*\\*)?${label}\\s*[:：](?:\\*\\*)?\\s*([^\\n]+)`));
    const inlineValue = inlineMatch?.[1]?.trim();
    if (inlineValue) return inlineValue;
    const blockMatch = text.match(new RegExp(`(?:^|\\n)#{1,3}\\s*${label}\\s*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s|\\n(?:\\*\\*)?[^\\n:：]{2,20}\\s*[:：]|$)`));
    const blockValue = blockMatch?.[1]?.trim();
    if (blockValue) return blockValue;
  }
  return "";
}

function inferFreeTextProductName(text: string) {
  const firstLine = text.split(/\n+/).map((item) => item.trim()).find(Boolean) || "";
  const cleaned = firstLine
    .replace(/^(商品|产品|品名|名称)\s*[:：]\s*/i, "")
    .split(/[，。；;,.]/)[0]
    .trim();
  return cleaned.length > 28 ? `${cleaned.slice(0, 28)}…` : cleaned;
}
