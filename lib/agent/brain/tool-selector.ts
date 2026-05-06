import type { AgentBrainRequest, AgentBrainTrace, ImageUnderstandingResult } from "@/lib/agent/brain/types";
import { addTraceEvent } from "@/lib/agent/brain/trace";
import { WORKFLOW_TOOLS } from "@/lib/agent/workflow/tools";
import type { WorkflowToolType } from "@/lib/agent/workflow/types";

export type CandidateWorkflowTool = {
  type: WorkflowToolType;
  title: string;
  enabled: boolean;
  score: number;
  reason: string;
};

export function selectCandidateTools(params: {
  request: AgentBrainRequest;
  imageUnderstanding: ImageUnderstandingResult | null;
  trace: AgentBrainTrace;
}): CandidateWorkflowTool[] {
  const text = params.request.userText;
  const hasImages = params.request.images.length > 0;
  const candidates = Object.values(WORKFLOW_TOOLS).map((tool) => {
    let score = tool.enabled ? 0.2 : 0.02;
    const reasons: string[] = [];

    if (!hasImages && tool.requiredCapabilities.includes("image_to_image")) score -= 0.2;
    if (hasImages && tool.type === "image_to_image") add(0.25, "有参考图，可做通用图生图");
    if (!hasImages && tool.type === "text_to_image") add(0.28, "无参考图，适合文生图");
    if (/(详情页|商品详情|详情长图|长图|卖点图|参数图|功能图|尺码图|淘宝|天猫|京东|拼多多|PDD|抖音|小红书|独立站|shopify|官网)/i.test(text) && tool.type === "commerce_detail") add(0.52, "语义目标是电商详情页");
    if (/(banner|主图|海报|活动图|推广图)/i.test(text) && tool.type === "commerce_creative") add(0.45, "语义目标是商业创意图");
    if (/(穿上|换装|试穿|上身|穿到|穿在)/.test(text) && tool.type === "tryon") add(0.55, "语义目标是人物换装");
    if (/(换脸|替换脸|换五官|替换五官|人脸替换|face\s*swap)/i.test(text) && tool.type === "face_swap") add(0.6, "语义目标是 AI 换脸");
    if (/(姿势|pose|四宫格|每张.*单独|独立出图)/i.test(text) && tool.type === "pose_variation") add(0.5, "语义目标是姿势裂变");
    if (/(3d|3D|立体|悬浮|陈列|商品展示)/.test(text) && tool.type === "garment_3d") add(0.48, "语义目标是 3D 展示感图片");
    if (/(背景|场景|空间|换环境)/.test(text) && tool.type === "background_replace") add(0.42, "语义目标是换背景");
    if (/(视频|走秀|动起来|短片)/.test(text) && tool.type === "image_to_video") add(0.8, "用户提到视频，但该工具当前预留未开启");
    if (/(真3D|3D模型|模型文件|glb|fbx)/i.test(text) && tool.type === "image_to_3d_asset") add(0.8, "用户提到真实 3D 资产，但该工具当前预留未开启");

    const imageRoles = params.imageUnderstanding?.images.map((img) => img.role) || [];
    if (imageRoles.includes("clothing") && imageRoles.some((role) => role === "person" || role === "reference") && tool.type === "tryon") {
      add(0.25, "视觉理解检测到服装图和人物/参考图");
    }
    if (imageRoles.includes("product") && tool.type === "commerce_detail") add(0.15, "视觉理解检测到商品主体");

    return {
      type: tool.type,
      title: tool.title,
      enabled: tool.enabled,
      score: Math.max(0, Math.min(1, Number(score.toFixed(2)))),
      reason: reasons.join("；") || tool.description,
    };

    function add(value: number, reason: string) {
      score += value;
      reasons.push(reason);
    }
  });

  const top = candidates
    .filter((candidate) => candidate.score >= 0.18)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  addTraceEvent(params.trace, {
    stage: "dynamic_tool_selector",
    status: "ok",
    summary: "Selected candidate tools for semantic routing.",
    data: {
      candidates: top.map(({ type, enabled, score, reason }) => ({ type, enabled, score, reason })),
    },
  });

  return top;
}
