import { getAdminClient } from "@/lib/supabase/admin";

export type AgentKnowledgeItem = {
  id: string;
  user_id: string;
  conversation_id?: string | null;
  scope: "global" | "brand" | "project" | "conversation";
  title: string;
  content: string;
  tags: string[];
  priority: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function getAgentKnowledgeContext(params: {
  userId: string;
  conversationId?: string | null;
  query?: string;
  limit?: number;
}) {
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("agent_knowledge_items")
      .select("*")
      .eq("user_id", params.userId)
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(80);

    if (error) throw error;
    const items = ((data || []) as AgentKnowledgeItem[])
      .filter((item) => item.scope !== "conversation" || !item.conversation_id || item.conversation_id === params.conversationId)
      .map((item) => ({ item, score: scoreKnowledgeItem(item, params.query || "", params.conversationId) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, params.limit || 8)
      .map((entry) => entry.item);

    return items;
  } catch (err) {
    console.warn("[agent-knowledge] load skipped:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export function buildKnowledgePrompt(items?: Array<Partial<AgentKnowledgeItem>> | null) {
  if (!Array.isArray(items) || !items.length) return "No brand or project knowledge is available.";
  return items
    .map((item, index) => {
      const tags = Array.isArray(item.tags) && item.tags.length ? ` tags=${item.tags.join(",")}` : "";
      return `${index + 1}. [${item.scope || "project"}] ${item.title || "Untitled"}${tags}: ${String(item.content || "").slice(0, 500)}`;
    })
    .join("\n");
}

function scoreKnowledgeItem(item: AgentKnowledgeItem, query: string, conversationId?: string | null) {
  let score = item.priority || 1;
  if (item.scope === "global") score += 0.4;
  if (item.scope === "brand") score += 0.8;
  if (item.scope === "project") score += 0.7;
  if (item.conversation_id && item.conversation_id === conversationId) score += 1.2;

  const haystack = `${item.title}\n${item.content}\n${item.tags.join("\n")}`.toLowerCase();
  const tokens = tokenize(query);
  for (const token of tokens) {
    if (haystack.includes(token.toLowerCase())) score += 0.5;
  }
  return score;
}

function tokenize(text: string) {
  return Array.from(new Set(
    text
      .replace(/[^\p{Script=Han}a-zA-Z0-9]+/gu, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .slice(0, 30)
  ));
}
