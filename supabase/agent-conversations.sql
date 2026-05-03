-- Agent 对话表
CREATE TABLE IF NOT EXISTS agent_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT '新对话',
  mode       TEXT NOT NULL DEFAULT 'agent' CHECK (mode IN ('chat', 'agent')),
  images     JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent 消息表
CREATE TABLE IF NOT EXISTS agent_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL DEFAULT '',
  images          JSONB DEFAULT '[]',
  generation      JSONB,
  params          JSONB DEFAULT '{}',
  mode            TEXT DEFAULT 'agent',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_agent_conversations_user ON agent_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation ON agent_messages(conversation_id, created_at);

-- RLS
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own conversations" ON agent_conversations;
CREATE POLICY "Users can manage own conversations"
  ON agent_conversations FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own messages" ON agent_messages;
CREATE POLICY "Users can manage own messages"
  ON agent_messages FOR ALL
  USING (conversation_id IN (
    SELECT id FROM agent_conversations WHERE user_id = auth.uid()
  ));
