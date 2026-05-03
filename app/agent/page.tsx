"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { ConversationSidebar } from "@/components/agent/ConversationSidebar";
import { ChatMessageList } from "@/components/agent/ChatMessageList";
import { ChatInputArea } from "@/components/agent/ChatInputArea";
import { useAgentStore } from "@/lib/store/agent-store";
import { createClient } from "@/lib/supabase/client";

export default function AgentPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Store
  const conversations = useAgentStore((s) => s.conversations);
  const activeConversationId = useAgentStore((s) => s.activeConversationId);
  const inputText = useAgentStore((s) => s.inputText);
  const inputImages = useAgentStore((s) => s.inputImages);
  const params = useAgentStore((s) => s.params);
  const isGenerating = useAgentStore((s) => s.isGenerating);
  const activeConversation = useAgentStore((s) => s.activeConversation);
  const estimatedCredits = useAgentStore((s) => s.estimatedCredits);
  const createConversation = useAgentStore((s) => s.createConversation);
  const switchConversation = useAgentStore((s) => s.switchConversation);
  const deleteConversation = useAgentStore((s) => s.deleteConversation);
  const setInputText = useAgentStore((s) => s.setInputText);
  const addInputImages = useAgentStore((s) => s.addInputImages);
  const removeInputImage = useAgentStore((s) => s.removeInputImage);
  const setParams = useAgentStore((s) => s.setParams);
  const sendMessage = useAgentStore((s) => s.sendMessage);
  const aiWrite = useAgentStore((s) => s.aiWrite);
  const retryGeneration = useAgentStore((s) => s.retryGeneration);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
      } else {
        setIsAuthenticated(true);
      }
    });
  }, [router]);

  const conv = activeConversation();
  const messages = conv?.messages || [];

  const handleQuickAction = (text: string) => {
    setInputText(text);
    // 立即发送
    setTimeout(() => {
      useAgentStore.getState().sendMessage();
    }, 50);
  };

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-[calc(100dvh-64px)] bg-[#f8f9fb]">
      {/* 左侧对话列表 */}
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConversationId}
        onCreate={createConversation}
        onSwitch={switchConversation}
        onDelete={deleteConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* 主区域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶部栏 */}
        <div className="flex items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-2.5 backdrop-blur-xl">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <h1 className="truncate text-sm font-bold text-slate-800">
            {conv?.title || "AI 服装生图"}
          </h1>
          <div className="flex-1" />
          <button
            onClick={createConversation}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-600"
          >
            新建对话
          </button>
        </div>

        {/* 消息区 */}
        <ChatMessageList
          messages={messages}
          isGenerating={isGenerating}
          onOpenImage={setLightboxSrc}
          onRetry={retryGeneration}
          onQuickAction={handleQuickAction}
        />

        {/* 输入区 */}
        <ChatInputArea
          inputText={inputText}
          inputImages={inputImages}
          params={params}
          isGenerating={isGenerating}
          estimatedCredits={estimatedCredits()}
          onTextChange={setInputText}
          onAddImages={addInputImages}
          onRemoveImage={removeInputImage}
          onParamsChange={setParams}
          onSend={sendMessage}
          onAIWrite={aiWrite}
        />
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="预览"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
