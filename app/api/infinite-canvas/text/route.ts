import { NextRequest, NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api/auth";
import { getChatCompletionsUrl, getLlmConfig } from "@/lib/api/llm-provider";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 60;

type CanvasTextMessage =
  | { role: "system" | "user" | "assistant"; content: unknown }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { role: "tool"; tool_call_id: string; content: string };

type CanvasTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
};

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`infinite-canvas-text:${auth.user.id}`, 30, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? (body.messages as CanvasTextMessage[]) : [];
  if (!messages.length) return NextResponse.json({ error: "缺少消息内容" }, { status: 400 });

  const hasImage = JSON.stringify(messages).includes('"image_url"');
  const config = getLlmConfig(hasImage ? "vision" : "text");
  if (!config.apiKey || !config.baseUrl || !config.model) {
    return NextResponse.json({ error: "无限画布文本模型未配置" }, { status: 503 });
  }

  const tools = normalizeTools(body.tools);
  const payload = {
    model: config.model,
    messages: normalizeMessages(messages),
    temperature: 0.35,
    max_tokens: normalizeMaxTokens(body.maxTokens),
    ...(tools.length ? { tools, tool_choice: normalizeToolChoice(body.toolChoice) } : {}),
  };

  const response = await fetch(getChatCompletionsUrl(config), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = readProviderError(result) || `模型请求失败 (${response.status})`;
    return NextResponse.json({ error: message }, { status: response.status });
  }

  const choice = Array.isArray(result?.choices) ? result.choices[0] : null;
  const message = choice?.message || {};
  return NextResponse.json({
    content: typeof message.content === "string" ? message.content : "",
    toolCalls: normalizeToolCalls(message.tool_calls),
  });
}

function normalizeMessages(messages: CanvasTextMessage[]) {
  const normalized: Array<Record<string, unknown>> = [];
  messages.forEach((message) => {
    if ("type" in message && message.type === "function_call") {
      normalized.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: message.call_id,
            type: "function",
            function: {
              name: message.name,
              arguments: message.arguments || "{}",
            },
          },
        ],
      });
      return;
    }
    if ("role" in message && message.role === "tool") {
      normalized.push({ role: "tool", tool_call_id: message.tool_call_id, content: String(message.content || "") });
      return;
    }
    if ("role" in message && (message.role === "system" || message.role === "user" || message.role === "assistant")) {
      normalized.push({ role: message.role, content: normalizeContent(message.content) });
    }
  });
  return normalized;
}

function normalizeContent(content: unknown) {
  if (!Array.isArray(content)) return typeof content === "string" ? content : String(content || "");
  const normalized: Array<Record<string, unknown>> = [];
  content.forEach((part) => {
    if (!part || typeof part !== "object") return [];
    const record = part as Record<string, unknown>;
    if (record.type === "text") {
      normalized.push({ type: "text", text: String(record.text || "") });
      return;
    }
    if (record.type === "image_url" && record.image_url && typeof record.image_url === "object") {
      const imageUrl = (record.image_url as Record<string, unknown>).url;
      if (typeof imageUrl === "string") normalized.push({ type: "image_url", image_url: { url: imageUrl } });
    }
  });
  return normalized;
}

function normalizeTools(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((tool): CanvasTool[] => {
    if (!tool || typeof tool !== "object") return [];
    const record = tool as CanvasTool;
    if (record.type !== "function" || !record.function?.name) return [];
    return [
      {
        type: "function",
        function: {
          name: record.function.name,
          description: record.function.description,
          parameters: record.function.parameters || { type: "object", properties: {} },
          strict: record.function.strict,
        },
      },
    ];
  });
}

function normalizeToolChoice(value: unknown) {
  if (value === "required") return "required";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "function" && typeof record.name === "string") {
      return { type: "function", function: { name: record.name } };
    }
    if (record.type === "function" && record.function && typeof record.function === "object" && typeof (record.function as Record<string, unknown>).name === "string") {
      return { type: "function", function: { name: (record.function as Record<string, unknown>).name } };
    }
  }
  return "auto";
}

function normalizeToolCalls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((call) => {
    if (!call || typeof call !== "object") return [];
    const record = call as Record<string, unknown>;
    const fn = record.function && typeof record.function === "object" ? (record.function as Record<string, unknown>) : null;
    const name = typeof fn?.name === "string" ? fn.name : "";
    if (!name) return [];
    return [
      {
        id: typeof record.id === "string" ? record.id : crypto.randomUUID(),
        type: "function",
        function: {
          name,
          arguments: typeof fn?.arguments === "string" ? fn.arguments : "{}",
        },
      },
    ];
  });
}

function normalizeMaxTokens(value: unknown) {
  const numeric = Math.floor(Number(value) || 1200);
  return Math.max(256, Math.min(4000, numeric));
}

function readProviderError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error === "object" && typeof (record.error as Record<string, unknown>).message === "string") {
    return String((record.error as Record<string, unknown>).message);
  }
  if (typeof record.message === "string") return record.message;
  return "";
}
