export const AI_TOOL_MATTING_COMPOSE_MAX_JSON_BYTES = 16 * 1024;

const REQUEST_KEYS = new Set([
  "request_id",
  "source_url",
  "base_mask_url",
  "base_mask_kind",
  "edit_mask_url",
  "edit_operation",
]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/;
const MAX_URL_LENGTH = 2_048;

export type AiToolMattingMatteKind = "mask" | "alpha";
export type AiToolMattingEditOperation = "add" | "subtract" | "replace";

export type AiToolMattingComposeRequest = {
  request_id: string;
  source_url: string;
  base_mask_url: string;
  base_mask_kind: AiToolMattingMatteKind;
  edit_mask_url?: string;
  edit_operation?: AiToolMattingEditOperation;
};

export type AiToolMattingComposeMask = {
  /** Short-lived signed reference URL accepted by other AI tool requests. */
  url: string;
  /** User-bound proof token paired with url. */
  ref: string;
  width: number;
  height: number;
  content_type: "image/png";
  expires_at: string;
};

export type AiToolMattingComposeValidationIssue = {
  path: string;
  code: "invalid_type" | "invalid_value" | "missing_field" | "unknown_field";
  message: string;
};

export type AiToolMattingComposeParseResult =
  | { ok: true; data: AiToolMattingComposeRequest }
  | { ok: false; issues: AiToolMattingComposeValidationIssue[] };

export function parseAiToolMattingComposeRequest(value: unknown): AiToolMattingComposeParseResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", code: "invalid_type", message: "请求体必须是 JSON 对象" }],
    };
  }

  const issues: AiToolMattingComposeValidationIssue[] = [];
  for (const key of Object.keys(value)) {
    if (!REQUEST_KEYS.has(key)) {
      issues.push({ path: `$.${key}`, code: "unknown_field", message: `不支持字段 ${key}` });
    }
  }

  const requestId = readRequiredString(value, "request_id", issues);
  if (requestId && !REQUEST_ID_PATTERN.test(requestId)) {
    issues.push({
      path: "$.request_id",
      code: "invalid_value",
      message: "request_id 需为 8-120 位字母、数字、点、下划线、冒号或连字符",
    });
  }

  const sourceUrl = readPublicImageUrl(value, "source_url", true, issues);
  const baseMaskUrl = readPublicImageUrl(value, "base_mask_url", true, issues);
  const editMaskUrl = readPublicImageUrl(value, "edit_mask_url", false, issues);
  if (sourceUrl && baseMaskUrl && sourceUrl === baseMaskUrl) {
    issues.push({
      path: "$.base_mask_url",
      code: "invalid_value",
      message: "base_mask_url 不能与 source_url 相同",
    });
  }
  if (editMaskUrl && (editMaskUrl === sourceUrl || editMaskUrl === baseMaskUrl)) {
    issues.push({
      path: "$.edit_mask_url",
      code: "invalid_value",
      message: "edit_mask_url 不能与 source_url 或 base_mask_url 相同",
    });
  }

  const baseMaskKind = value.base_mask_kind;
  if (baseMaskKind !== "mask" && baseMaskKind !== "alpha") {
    issues.push({
      path: "$.base_mask_kind",
      code: baseMaskKind === undefined ? "missing_field" : "invalid_value",
      message: "base_mask_kind 仅支持 mask 或 alpha",
    });
  }

  const editOperation = value.edit_operation;
  const hasValidEditOperation = isEditOperation(editOperation);
  if (editMaskUrl && !hasValidEditOperation) {
    issues.push({
      path: "$.edit_operation",
      code: editOperation === undefined ? "missing_field" : "invalid_value",
      message: "提供 edit_mask_url 时，edit_operation 必须是 add、subtract 或 replace",
    });
  } else if (!editMaskUrl && editOperation !== undefined) {
    issues.push({
      path: "$.edit_operation",
      code: "invalid_value",
      message: "未提供 edit_mask_url 时不能设置 edit_operation",
    });
  }

  if (
    issues.length
    || !requestId
    || !sourceUrl
    || !baseMaskUrl
    || (baseMaskKind !== "mask" && baseMaskKind !== "alpha")
  ) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    data: {
      request_id: requestId,
      source_url: sourceUrl,
      base_mask_url: baseMaskUrl,
      base_mask_kind: baseMaskKind,
      ...(editMaskUrl && hasValidEditOperation
        ? { edit_mask_url: editMaskUrl, edit_operation: editOperation }
        : {}),
    },
  };
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string,
  issues: AiToolMattingComposeValidationIssue[],
) {
  const field = value[key];
  if (typeof field !== "string" || !field.trim()) {
    issues.push({
      path: `$.${key}`,
      code: field === undefined ? "missing_field" : "invalid_type",
      message: `${key} 必须是非空字符串`,
    });
    return null;
  }
  return field.trim();
}

function readPublicImageUrl(
  value: Record<string, unknown>,
  key: "source_url" | "base_mask_url" | "edit_mask_url",
  required: boolean,
  issues: AiToolMattingComposeValidationIssue[],
) {
  if (!required && value[key] === undefined) return null;
  const field = readRequiredString(value, key, issues);
  if (!field) return null;
  if (field.length > MAX_URL_LENGTH) {
    issues.push({ path: `$.${key}`, code: "invalid_value", message: `${key} 不能超过 2048 个字符` });
    return null;
  }
  try {
    const url = new URL(field);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || isObviouslyPrivateHost(url.hostname)) {
      throw new Error("unsafe URL");
    }
    return url.toString();
  } catch {
    issues.push({ path: `$.${key}`, code: "invalid_value", message: `${key} 必须是公开 HTTPS 图片地址` });
    return null;
  }
}

function isObviouslyPrivateHost(hostname: string) {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  return host === "localhost"
    || host.endsWith(".localhost")
    || host.endsWith(".local")
    || host === "0.0.0.0"
    || host === "127.0.0.1"
    || host === "::1"
    || host === "[::1]";
}

function isEditOperation(value: unknown): value is AiToolMattingEditOperation {
  return value === "add" || value === "subtract" || value === "replace";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
