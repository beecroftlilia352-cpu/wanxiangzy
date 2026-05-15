import type { ChatImage } from "@/lib/agent/types";

export const DEFAULT_CONVERSATION_TITLE = "\u65b0\u5bf9\u8bdd";

const DEFAULT_TITLE_ALIASES = [
  DEFAULT_CONVERSATION_TITLE,
  "new chat",
  "untitled",
  "\u65b0\u4f1a\u8bdd",
];

export function isDefaultConversationTitle(title?: string | null) {
  const normalized = normalizeTitle(title || "");
  if (!normalized) return true;
  if (normalized.includes("\u65b0\u5bf9\u8bdd")) return true;
  if (normalized.includes("\u65b0\u4f1a\u8bdd")) return true;
  if (normalized.includes("\u93c2\u677f")) return true;
  return DEFAULT_TITLE_ALIASES.some((item) => normalized === normalizeTitle(item));
}

export function deriveConversationTitle(
  text?: string | null,
  images?: Array<Pick<ChatImage, "role" | "fileName">> | null,
) {
  const cleaned = sanitizeMessageForTitle(text || "");
  if (cleaned) return deriveSemanticTitle(cleaned) || truncateTitle(cleaned);

  const imageCount = Array.isArray(images) ? images.length : 0;
  if (imageCount > 0) {
    const roles = new Set(images?.map((image) => image.role).filter(Boolean));
    if (roles.has("face")) return "\u56fe\u7247\u6362\u8138\u4efb\u52a1";
    if (roles.has("clothing")) return "\u670d\u88c5\u89c6\u89c9\u4efb\u52a1";
    return imageCount > 1 ? `${imageCount} \u5f20\u56fe\u7247\u4efb\u52a1` : "\u56fe\u7247\u5206\u6790";
  }

  return DEFAULT_CONVERSATION_TITLE;
}

function sanitizeMessageForTitle(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^(@\S+\s*)+/, "")
    .replace(/^(\u5e2e\u6211|\u8bf7|\u9ebb\u70e6|\u53ef\u4ee5|\u80fd\u4e0d\u80fd|\u80fd\u5426|\u6211\u8981|\u6211\u60f3)\s*/u, "")
    .trim();
}

function truncateTitle(value: string) {
  const compact = value.replace(/[\u3002\uff01\uff1f!?]+$/g, "").trim();
  if (compact.length <= 24) return compact;
  return `${compact.slice(0, 24)}...`;
}

function normalizeTitle(value: string) {
  return value.trim().toLowerCase();
}

function deriveSemanticTitle(value: string) {
  const compact = value.replace(/\s+/g, "").toLowerCase();
  const wantsTryOn = hasAny(compact, [
    "\u6362\u88c5",
    "\u7a7f\u5230",
    "\u7a7f\u4e0a",
    "\u8bd5\u7a7f",
    "\u4e0a\u8eab",
    "tryon",
    "try-on",
  ]);
  const wantsPose = hasAny(compact, ["\u59ff\u52bf", "\u88c2\u53d8", "pose"]);
  const wantsDetail = hasAny(compact, [
    "\u8be6\u60c5\u9875",
    "\u5546\u54c1\u9875",
    "\u7535\u5546",
    "\u6dd8\u5b9d",
    "\u5929\u732b",
    "\u62fc\u591a\u591a",
    "pdd",
    "\u6296\u97f3",
    "\u5c0f\u7ea2\u4e66",
  ]);
  const wantsFace = hasAny(compact, ["\u6362\u8138", "\u8138\u56fe", "face"]);
  const wantsBackground = hasAny(compact, ["\u6362\u80cc\u666f", "\u80cc\u666f"]);
  const wantsThreeD = hasAny(compact, ["3d", "\u7acb\u4f53", "\u4e09\u7ef4"]);
  const wantsVideo = hasAny(compact, ["\u89c6\u9891", "video"]);
  const wantsAnalyze = hasAny(compact, ["\u5206\u6790", "\u770b\u770b", "\u5224\u65ad", "\u8bc6\u522b"]);

  if (wantsTryOn && wantsPose && wantsDetail) return "\u6362\u88c5\u59ff\u52bf\u88c2\u53d8\u8be6\u60c5\u9875";
  if (wantsTryOn && wantsPose) return "\u6362\u88c5\u540e\u59ff\u52bf\u88c2\u53d8";
  if (wantsTryOn && wantsDetail) return "\u6362\u88c5\u8be6\u60c5\u9875\u751f\u6210";
  if (wantsPose && wantsDetail) return "\u591a\u59ff\u52bf\u8be6\u60c5\u9875\u751f\u6210";
  if (wantsDetail) return deriveDetailPlatformTitle(compact);
  if (wantsTryOn) return "\u4eba\u7269\u6362\u88c5\u751f\u6210";
  if (wantsPose) return "\u59ff\u52bf\u88c2\u53d8\u751f\u6210";
  if (wantsFace) return "\u6362\u8138";
  if (wantsBackground) return "\u6a21\u7279\u6362\u80cc\u666f";
  if (wantsThreeD) return "\u670d\u88c5 3D \u5c55\u793a";
  if (wantsVideo) return "\u89c6\u9891\u4efb\u52a1";
  if (wantsAnalyze) return "\u56fe\u7247\u5206\u6790";
  if (hasAny(compact, ["\u4f60\u80fd\u505a\u4ec0\u4e48", "\u4f60\u662f\u8c01", "\u80fd\u529b"])) return "\u80fd\u529b\u4ecb\u7ecd";
  return "";
}

function deriveDetailPlatformTitle(value: string) {
  if (value.includes("\u6dd8\u5b9d")) return "\u6dd8\u5b9d\u8be6\u60c5\u9875\u751f\u6210";
  if (value.includes("\u5929\u732b")) return "\u5929\u732b\u8be6\u60c5\u9875\u751f\u6210";
  if (value.includes("\u62fc\u591a\u591a") || value.includes("pdd")) return "\u62fc\u591a\u591a\u8be6\u60c5\u9875\u751f\u6210";
  if (value.includes("\u6296\u97f3")) return "\u6296\u97f3\u5546\u54c1\u7d20\u6750";
  if (value.includes("\u5c0f\u7ea2\u4e66")) return "\u5c0f\u7ea2\u4e66\u5546\u54c1\u7d20\u6750";
  if (value.includes("\u624b\u673a") || value.includes("\u957f\u56fe")) return "\u624b\u673a\u8be6\u60c5\u957f\u56fe";
  return "\u7535\u5546\u8be6\u60c5\u9875\u751f\u6210";
}

function hasAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}
