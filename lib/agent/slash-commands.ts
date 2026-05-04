/**
 * 快捷指令定义
 * 用户输入 "/" 时显示的命令列表
 */

export interface SlashCommand {
  id: string;
  name: string;           // 触发名（不含 /）
  label: string;          // 显示名
  description: string;    // 简短描述
  icon: string;           // emoji 图标
  category: "generation" | "analysis" | "utility";
  /** 直接执行（不需要额外输入） */
  action?: "send" | "clear" | "settings" | "aiwrite";
  /** 填入输入框的模板文本（用户可编辑后发送） */
  template?: string;
  /** 需要图片 */
  requiresImages?: boolean;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // ===== 生图类 =====
  {
    id: "tryon",
    name: "tryon",
    label: "服装上身",
    description: "把衣服穿到模特身上",
    icon: "👕",
    category: "generation",
    template: "帮我把图1的衣服穿到模特身上",
    requiresImages: true,
  },
  {
    id: "grass",
    name: "grass",
    label: "种草图",
    description: "生成小红书风格种草图",
    icon: "📱",
    category: "generation",
    template: "帮我出一套小红书种草图",
    requiresImages: true,
  },
  {
    id: "3d",
    name: "3d",
    label: "3D 展示",
    description: "平铺图转 3D 立体效果",
    icon: "📦",
    category: "generation",
    template: "帮我做 3D 立体商品展示",
    requiresImages: true,
  },
  {
    id: "background",
    name: "background",
    label: "换背景",
    description: "替换图片背景",
    icon: "🖼️",
    category: "generation",
    template: "帮我换个背景",
    requiresImages: true,
  },
  {
    id: "pose",
    name: "pose",
    label: "姿势裂变",
    description: "一张图生成四种姿势",
    icon: "🧍",
    category: "generation",
    template: "帮我做四宫格姿势裂变",
    requiresImages: true,
  },
  {
    id: "model",
    name: "model",
    label: "专属模特",
    description: "创建专属 AI 模特",
    icon: "👤",
    category: "generation",
    template: "帮我建一个专属模特",
    requiresImages: true,
  },

  // ===== 分析类 =====
  {
    id: "analyze",
    name: "analyze",
    label: "分析图片",
    description: "识别品类、颜色、风格、面料",
    icon: "🔍",
    category: "analysis",
    template: "请详细分析这张图片的内容",
    requiresImages: true,
  },
  {
    id: "style",
    name: "style",
    label: "风格建议",
    description: "推荐拍摄风格和构图",
    icon: "💡",
    category: "analysis",
    template: "给我拍摄风格和构图建议",
    requiresImages: true,
  },
  {
    id: "prompt",
    name: "prompt",
    label: "AI 帮写",
    description: "根据图片生成专业提示词",
    icon: "✨",
    category: "analysis",
    action: "aiwrite",
    requiresImages: true,
  },

  // ===== 工具类 =====
  {
    id: "clear",
    name: "clear",
    label: "清空对话",
    description: "开始新对话",
    icon: "🗑️",
    category: "utility",
    action: "clear",
  },
  {
    id: "help",
    name: "help",
    label: "帮助",
    description: "查看所有可用指令",
    icon: "❓",
    category: "utility",
    template: "你有哪些功能？请详细介绍",
  },
];

/**
 * 过滤命令列表
 */
export function filterCommands(query: string): SlashCommand[] {
  if (!query) return SLASH_COMMANDS;
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(q) ||
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q)
  );
}

/**
 * 检测用户是否正在输入 / 命令
 */
export function detectSlashTrigger(text: string, cursorPos: number): { active: boolean; query: string } {
  const before = text.slice(0, cursorPos);
  const slashIndex = before.lastIndexOf("/");

  if (slashIndex === -1) return { active: false, query: "" };

  // / 前面必须是空白或行首
  if (slashIndex > 0 && !/\s/.test(before[slashIndex - 1])) return { active: false, query: "" };

  const afterSlash = before.slice(slashIndex + 1);
  // / 后面只能跟字母数字
  if (!/^[a-zA-Z0-9]*$/.test(afterSlash)) return { active: false, query: "" };

  return { active: true, query: afterSlash };
}

/**
 * 替换 /command 为模板文本
 */
export function applyCommand(text: string, cursorPos: number, command: SlashCommand): { text: string; cursorPos: number } {
  const before = text.slice(0, cursorPos);
  const slashIndex = before.lastIndexOf("/");
  if (slashIndex === -1) return { text, cursorPos };

  const after = text.slice(cursorPos);
  const template = command.template || "";

  return {
    text: text.slice(0, slashIndex) + template + after,
    cursorPos: slashIndex + template.length,
  };
}
