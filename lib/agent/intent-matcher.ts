import type { IntentResult, IntentRule, ModuleKey } from "./types";

const INTENT_RULES: IntentRule[] = [
  {
    patterns: [/换[装到上]/, /穿[到在]/, /服装上身/, /试穿/, /上身图/, /上身效果/],
    intent: "tryon",
    label: "服装上身",
    icon: "Shirt",
    styleExtractors: [
      { pattern: /韩系|韩式|韩国/, value: "韩系清透" },
      { pattern: /电商|白底|商品图/, value: "电商白底" },
      { pattern: /小红书|种草/, value: "小红书生活感" },
      { pattern: /杂志|大片|时尚/, value: "时尚杂志" },
      { pattern: /街拍|街头/, value: "欧美 Campaign" },
      { pattern: /轻奢|lookbook/i, value: "轻奢 Lookbook" },
    ],
    requiredImages: [
      { key: "clothing_urls", label: "服装图", min: 1, max: 5 },
      { key: "model_face_url", label: "模特脸（可选）", min: 0, max: 1 },
      { key: "reference_url", label: "参考姿势图（可选）", min: 0, max: 1 },
    ],
    defaultParams: { ai_model: "gpt-image-2", aspect_ratio: "3:4", image_size: "1K", gen_count: 1 },
    costMultiplier: 1,
  },
  {
    patterns: [/种草/, /小红书/, /生活.*图/, /街拍/, /穿搭分享/],
    intent: "grass",
    label: "服装种草图",
    icon: "Heart",
    styleExtractors: [
      { pattern: /街拍|街头|street/i, value: "street" },
      { pattern: /咖啡|cafe/i, value: "cafe" },
      { pattern: /居家|home/, value: "home" },
      { pattern: /电梯|elevator/, value: "elevator" },
    ],
    requiredImages: [
      { key: "garment_url", label: "服装图", min: 1, max: 1 },
      { key: "reference_url", label: "参考场景图（可选）", min: 0, max: 1 },
    ],
    defaultParams: { ai_model: "gpt-image-2", aspect_ratio: "3:4", image_size: "1K", gen_count: 1, scene_mode: "auto" },
    costMultiplier: 1,
  },
  {
    patterns: [/专属模特/, /建.*模特/, /创建.*脸/, /融合.*模特/, /定制模特/],
    intent: "model",
    label: "专属模特",
    icon: "UserRound",
    styleExtractors: [
      { pattern: /韩系|韩式/, value: "korean_clear" },
      { pattern: /自然|原生/, value: "fusion_natural" },
      { pattern: /电商/, value: "ecommerce_clean" },
      { pattern: /杂志|大片/, value: "magazine" },
      { pattern: /小红书/, value: "xiaohongshu_life" },
      { pattern: /欧美/, value: "european_campaign" },
    ],
    requiredImages: [
      { key: "reference_urls", label: "参考人脸图", min: 1, max: 3 },
      { key: "hair_reference_url", label: "发型参考（可选）", min: 0, max: 1 },
    ],
    defaultParams: { ai_model: "gpt-image-2", aspect_ratio: "3:4", image_size: "1K", gen_count: 1, gender: "female" },
    costMultiplier: 1,
  },
  {
    patterns: [/换背景/, /换模特/, /换景/, /背景.*替换/, /白底.*换/],
    intent: "model_background",
    label: "换背景/换模特",
    icon: "Images",
    styleExtractors: [
      { pattern: /只换背景|换背景/, value: "background_only" },
      { pattern: /只换模特|换脸/, value: "model_only" },
      { pattern: /都换|全换|换背景.*换模特/, value: "both" },
    ],
    requiredImages: [
      { key: "source_url", label: "原图", min: 1, max: 1 },
      { key: "model_reference_url", label: "模特参考图（换模特时需要）", min: 0, max: 1 },
      { key: "background_reference_url", label: "背景参考图（可选）", min: 0, max: 1 },
    ],
    defaultParams: { ai_model: "gpt-image-2", aspect_ratio: "3:4", image_size: "1K", gen_count: 1, mode: "background_only", background_source: "auto_prompt" },
    costMultiplier: 1,
  },
  {
    patterns: [/姿势.*裂变/, /四宫格/, /pose/i, /多个姿势/, /姿势.*变/],
    intent: "pose",
    label: "姿势裂变",
    icon: "PersonStanding",
    styleExtractors: [],
    requiredImages: [
      { key: "main_image_url", label: "主图", min: 1, max: 1 },
    ],
    defaultParams: { ai_model: "gpt-image-2", image_size: "1K", gen_count: 1 },
    costMultiplier: 1,
  },
  {
    patterns: [/3[dD]/, /立体/, /服装.*3[Dd]/, /平铺.*立体/, /商品展示/],
    intent: "garment_3d",
    label: "服装3D",
    icon: "Box",
    styleExtractors: [],
    requiredImages: [
      { key: "garment_url", label: "服装图", min: 1, max: 1 },
      { key: "reference_url", label: "3D 参考图（可选）", min: 0, max: 1 },
    ],
    defaultParams: { ai_model: "gpt-image-2", aspect_ratio: "3:4", image_size: "1K", gen_count: 1 },
    costMultiplier: 1,
  },
];

export function matchIntent(text: string): IntentResult {
  const normalized = text.toLowerCase().trim();
  if (!normalized) {
    return { intent: "unknown", confidence: 0, params: {} };
  }

  let bestMatch: { rule: IntentRule; score: number } | null = null;

  for (const rule of INTENT_RULES) {
    const matchedPatterns = rule.patterns.filter((p) => p.test(normalized));
    if (matchedPatterns.length === 0) continue;

    const score = matchedPatterns.length;
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { rule, score };
    }
  }

  if (!bestMatch) {
    return {
      intent: "unknown",
      confidence: 0,
      params: {},
      clarification: "我没有完全理解你的需求。你可以试试：\n• 服装上身\n• 种草图\n• 专属模特\n• 换背景\n• 姿势裂变\n• 服装3D",
    };
  }

  const { rule } = bestMatch;
  const params: Record<string, unknown> = { ...rule.defaultParams };

  // Extract style hints
  for (const extractor of rule.styleExtractors) {
    if (extractor.pattern.test(normalized)) {
      if (rule.intent === "grass") {
        params.template_id = extractor.value;
      } else if (rule.intent === "model") {
        params.model_style = extractor.value;
      } else if (rule.intent === "model_background") {
        params.mode = extractor.value;
      } else {
        params.style = extractor.value;
      }
      break;
    }
  }

  // Extract gen_count
  const countMatch = normalized.match(/(\d+)\s*[张个份]/);
  if (countMatch) {
    const count = Math.min(Math.max(Number(countMatch[1]), 1), 4);
    params.gen_count = count;
  }

  return {
    intent: rule.intent,
    confidence: Math.min(bestMatch.score / 2, 1),
    params,
    missingFields: rule.requiredImages.filter((s) => s.min > 0).map((s) => s.key),
  };
}

export function getModuleInfo(intent: ModuleKey): IntentRule | undefined {
  return INTENT_RULES.find((r) => r.intent === intent);
}

export function getAllModules(): Array<{ intent: ModuleKey; label: string; icon: string }> {
  return INTENT_RULES.map((r) => ({ intent: r.intent, label: r.label, icon: r.icon }));
}
