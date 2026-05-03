export interface QuickTemplate {
  id: string;
  title: string;
  description: string;
  message: string;
  icon: string; // lucide icon name
}

export const QUICK_START_TEMPLATES: QuickTemplate[] = [
  {
    id: "tryon-simple",
    title: "服装上身",
    description: "把衣服穿到模特身上，生成真实试穿效果",
    message: "帮我把这件衣服换到模特身上",
    icon: "Shirt",
  },
  {
    id: "grass-xiaohongshu",
    title: "种草图",
    description: "生成小红书风格穿搭种草图",
    message: "帮我出一套小红书种草图",
    icon: "Heart",
  },
  {
    id: "model-create",
    title: "专属模特",
    description: "创建一个稳定的专属 AI 模特身份",
    message: "帮我建一个韩系专属模特",
    icon: "UserRound",
  },
  {
    id: "background-swap",
    title: "换背景",
    description: "替换图片背景或更换模特",
    message: "帮我把这个白底图换成街拍背景",
    icon: "Images",
  },
  {
    id: "pose-grid",
    title: "姿势裂变",
    description: "一张图生成四个不同姿势",
    message: "帮我把这张图做姿势裂变",
    icon: "PersonStanding",
  },
  {
    id: "garment-3d",
    title: "服装 3D",
    description: "平铺图转立体商品展示效果",
    message: "帮我把这张平铺图做成 3D 效果",
    icon: "Box",
  },
];

export const FOLLOW_UP_SUGGESTIONS: Record<string, string[]> = {
  tryon: ["换个韩系风格试试", "再出 2 张不同姿势", "帮我做一张种草图"],
  grass: ["换个街拍场景", "再出 2 张", "帮我做四宫格姿势"],
  model: ["用这个模特做换装", "换个风格试试", "再出 2 张"],
  model_background: ["只换背景试试", "换个模特试试", "再出 2 张"],
  pose: ["换个风格", "帮我做种草图", "再出 2 张"],
  garment_3d: ["换个角度", "再出 2 张", "帮我做种草图"],
};
