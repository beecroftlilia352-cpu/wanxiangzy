/**
 * Agent 工具定义 — 所有可调用的能力
 * 这些工具会被传给 LLM 作为 function calling 的 schema
 */

export interface AgentTool {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "analyze_image",
    label: "图片分析",
    description: "分析图片内容：识别服装品类、颜色、面料、风格、场景等细节",
    parameters: {
      type: "object",
      properties: {
        image_url: { type: "string", description: "要分析的图片 URL（使用 @图N 引用）" },
        focus: { type: "string", description: "分析重点：clothing/style/scene/general" },
      },
      required: ["image_url"],
    },
  },
  {
    name: "generate_tryon",
    label: "服装上身",
    description: "将服装穿到模特身上，生成真实试穿效果图",
    parameters: {
      type: "object",
      properties: {
        clothing_urls: { type: "array", items: { type: "string" }, description: "服装图 URL 列表" },
        reference_url: { type: "string", description: "参考姿势/场景图 URL（可选）" },
        model_face_url: { type: "string", description: "模特脸图 URL（可选）" },
        style: { type: "string", description: "风格描述：韩系/电商/杂志等" },
        aspect_ratio: { type: "string", description: "输出比例：3:4/1:1/9:16" },
      },
      required: ["clothing_urls"],
    },
  },
  {
    name: "generate_grass",
    label: "种草图",
    description: "生成小红书风格的穿搭种草图",
    parameters: {
      type: "object",
      properties: {
        garment_url: { type: "string", description: "服装图 URL" },
        reference_url: { type: "string", description: "参考场景图 URL（可选）" },
        scene: { type: "string", description: "场景：街拍/咖啡店/居家/电梯" },
        style: { type: "string", description: "风格描述" },
      },
      required: ["garment_url"],
    },
  },
  {
    name: "generate_model",
    label: "专属模特",
    description: "融合参考人脸创建稳定的专属 AI 模特",
    parameters: {
      type: "object",
      properties: {
        reference_urls: { type: "array", items: { type: "string" }, description: "参考人脸图 URL（1-3张）" },
        style: { type: "string", description: "风格：韩系/融合原生/电商/杂志" },
        gender: { type: "string", description: "性别：male/female" },
      },
      required: ["reference_urls"],
    },
  },
  {
    name: "generate_background",
    label: "换背景",
    description: "替换图片背景或更换模特",
    parameters: {
      type: "object",
      properties: {
        source_url: { type: "string", description: "原图 URL" },
        background_url: { type: "string", description: "背景参考图 URL（可选）" },
        background_text: { type: "string", description: "背景描述文字（如：咖啡店、花园）" },
        mode: { type: "string", description: "模式：background_only/model_only/both" },
      },
      required: ["source_url"],
    },
  },
  {
    name: "generate_pose",
    label: "姿势裂变",
    description: "一张图生成四种不同姿势的 2x2 四宫格",
    parameters: {
      type: "object",
      properties: {
        main_image_url: { type: "string", description: "主图 URL" },
      },
      required: ["main_image_url"],
    },
  },
  {
    name: "generate_3d",
    label: "服装 3D",
    description: "平铺图转 3D 立体商品展示",
    parameters: {
      type: "object",
      properties: {
        garment_url: { type: "string", description: "服装图 URL" },
        reference_url: { type: "string", description: "3D 参考图 URL（可选）" },
      },
      required: ["garment_url"],
    },
  },
  {
    name: "style_advice",
    label: "风格建议",
    description: "根据服装图片推荐拍摄风格、构图、场景、配色方案",
    parameters: {
      type: "object",
      properties: {
        image_url: { type: "string", description: "服装图 URL" },
        context: { type: "string", description: "使用场景：电商主图/详情页/社交媒体/广告" },
      },
      required: ["image_url"],
    },
  },
  {
    name: "optimize_prompt",
    label: "提示词优化",
    description: "根据图片内容优化生图提示词，提升生成质量",
    parameters: {
      type: "object",
      properties: {
        image_urls: { type: "array", items: { type: "string" }, description: "图片 URL 列表" },
        current_prompt: { type: "string", description: "当前提示词（可选）" },
        target_style: { type: "string", description: "目标风格" },
      },
      required: ["image_urls"],
    },
  },
];

/** 工具名称 → 模块映射 */
export const TOOL_TO_MODULE: Record<string, string> = {
  generate_tryon: "tryon",
  generate_grass: "grass",
  generate_model: "model",
  generate_background: "model_background",
  generate_pose: "pose",
  generate_3d: "garment_3d",
};

/** 生成工具名称列表 */
export const GENERATION_TOOLS = new Set(Object.keys(TOOL_TO_MODULE));

/** 格式化工具列表给 LLM 的 system prompt */
export function formatToolsForPrompt(): string {
  return AGENT_TOOLS.map((t) =>
    `- ${t.name}: ${t.description}\n  参数: ${JSON.stringify(t.parameters.properties)}`
  ).join("\n");
}
