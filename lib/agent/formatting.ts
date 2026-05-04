export function buildSafeReplyExcerpt(text: string, maxLength: number): string {
  const normalized = normalizeAgentReplyText(text)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/^[*-]\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();

  if (normalized.length <= maxLength) return normalized;

  const head = normalized.slice(0, maxLength);
  const boundary = Math.max(
    head.lastIndexOf("。"),
    head.lastIndexOf("！"),
    head.lastIndexOf("？"),
    head.lastIndexOf("\n")
  );
  const clipped = (boundary >= 80 ? head.slice(0, boundary + 1) : head)
    .replace(/[*_`#>\-：:，,、\s]+$/g, "")
    .trim();

  return `${clipped || head.trim()}...`;
}

function normalizeAgentReplyText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/([^\n])\s+•\s+/g, "$1\n- ")
    .replace(/^\s*•\s+/gm, "- ")
    .replace(/([。！？])\s+(?=\*\*[^*\n]+?\*\*)/g, "$1\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
