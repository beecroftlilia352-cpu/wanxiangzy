import { getChatCompletionsUrl, getLlmFallbackConfigs } from "@/lib/api/llm-provider";
import type { AgentBrainTrace } from "@/lib/agent/brain/types";
import { addTraceEvent } from "@/lib/agent/brain/trace";

type LlmKind = "text" | "vision";

export async function callBrainJson(params: {
  kind: LlmKind;
  stage: string;
  trace: AgentBrainTrace;
  system: string;
  text: string;
  images?: string[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<Record<string, unknown> | null> {
  const providers = getLlmFallbackConfigs(params.kind);
  if (!providers.length) {
    addTraceEvent(params.trace, {
      stage: params.stage,
      status: "fallback",
      summary: "No LLM provider configured; using deterministic fallback.",
    });
    return null;
  }

  const content: Array<Record<string, unknown>> = [{ type: "text", text: params.text }];
  for (const url of params.images || []) {
    content.push({ type: "image_url", image_url: { url } });
  }

  for (const provider of providers) {
    const started = Date.now();
    const body = {
      model: provider.model,
      temperature: params.temperature ?? 0.15,
      max_tokens: params.maxTokens ?? 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: params.system },
        { role: "user", content },
      ],
    };

    const parsed = await requestJson({
      url: getChatCompletionsUrl(provider),
      apiKey: provider.apiKey,
      body,
      timeoutMs: params.timeoutMs ?? 35_000,
    }).catch((err) => {
      addTraceEvent(params.trace, {
        stage: params.stage,
        status: "warn",
        summary: "Provider call failed.",
        provider: provider.provider,
        model: provider.model,
        latencyMs: Date.now() - started,
        data: { error: err instanceof Error ? err.message : String(err) },
      });
      return null;
    });

    if (parsed) {
      addTraceEvent(params.trace, {
        stage: params.stage,
        status: "ok",
        summary: "Structured LLM output received.",
        provider: provider.provider,
        model: provider.model,
        latencyMs: Date.now() - started,
      });
      return parsed;
    }
  }

  addTraceEvent(params.trace, {
    stage: params.stage,
    status: "fallback",
    summary: "All providers failed or returned invalid JSON; using deterministic fallback.",
  });
  return null;
}

async function requestJson(params: {
  url: string;
  apiKey: string;
  body: Record<string, unknown>;
  timeoutMs: number;
}): Promise<Record<string, unknown> | null> {
  const response = await fetch(params.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.body),
    signal: AbortSignal.timeout(params.timeoutMs),
  });

  if (!response.ok && response.status >= 400 && response.status < 500) {
    const retryBody = { ...params.body };
    delete retryBody.response_format;
    const retry = await fetch(params.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(retryBody),
      signal: AbortSignal.timeout(params.timeoutMs),
    });
    if (!retry.ok) return null;
    return parseCompletionJson(await retry.json().catch(() => null));
  }

  if (!response.ok) return null;
  return parseCompletionJson(await response.json().catch(() => null));
}

function parseCompletionJson(data: unknown): Record<string, unknown> | null {
  const content = extractText(data);
  if (!content) return null;
  return extractJson(content);
}

function extractText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part?.text === "string" ? part.text : "")
      .join("\n");
  }
  return "";
}

export function extractJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text.trim());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1]);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {}
  }
  const balanced = findBalancedJsonObject(text);
  if (!balanced) return null;
  try {
    const parsed = JSON.parse(balanced);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function findBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") inString = true;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

