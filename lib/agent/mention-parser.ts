import type { MentionRef } from "./types";

/**
 * 解析文本中的 @图N 引用
 */
export function parseMentions(text: string): MentionRef[] {
  const regex = /@图(\d+)/g;
  const refs: MentionRef[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    refs.push({
      imageIndex: parseInt(match[1]),
      startPos: match.index,
      endPos: match.index + match[0].length,
    });
  }
  return refs;
}

/**
 * 从文本中提取所有被引用的图片索引（去重）
 */
export function extractMentionedIndices(text: string): number[] {
  const refs = parseMentions(text);
  return [...new Set(refs.map((r) => r.imageIndex))].sort((a, b) => a - b);
}

/**
 * 将文本中的 @图N 渲染为分段（用于 UI 展示）
 */
export function renderMentionSegments(text: string): Array<{ type: "text" | "mention"; value: string; imageIndex?: number }> {
  const segments: Array<{ type: "text" | "mention"; value: string; imageIndex?: number }> = [];
  const regex = /@图(\d+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "mention", value: match[0], imageIndex: parseInt(match[1]) });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * 检测用户是否正在输入 @ 触发下拉菜单
 */
export function detectMentionTrigger(text: string, cursorPos: number): { active: boolean; query: string } {
  // 从光标位置向前查找 @
  const before = text.slice(0, cursorPos);
  const atIndex = before.lastIndexOf("@");

  if (atIndex === -1) return { active: false, query: "" };

  // @ 前面必须是空白或行首
  if (atIndex > 0 && !/\s/.test(before[atIndex - 1])) return { active: false, query: "" };

  const afterAt = before.slice(atIndex + 1);
  // @ 后面只能跟"图"和数字
  if (!/^图?\d{0,2}$/.test(afterAt)) return { active: false, query: "" };

  return { active: true, query: afterAt };
}

/**
 * 在文本中插入 @图N 引用
 */
export function insertMention(text: string, cursorPos: number, imageIndex: number): { text: string; cursorPos: number } {
  const before = text.slice(0, cursorPos);
  const atIndex = before.lastIndexOf("@");

  if (atIndex === -1) {
    // 没找到 @，直接在光标处插入
    const mention = `@图${imageIndex} `;
    return {
      text: text.slice(0, cursorPos) + mention + text.slice(cursorPos),
      cursorPos: cursorPos + mention.length,
    };
  }

  // 替换 @ 及其后的输入为 @图N
  const after = text.slice(cursorPos);
  const mention = `@图${imageIndex} `;
  return {
    text: text.slice(0, atIndex) + mention + after,
    cursorPos: atIndex + mention.length,
  };
}
