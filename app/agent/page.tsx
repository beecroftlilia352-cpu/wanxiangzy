"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { ConversationSidebar } from "@/components/agent/ConversationSidebar";
import { ChatArea } from "@/components/agent/ChatArea";
import { InputComposer } from "@/components/agent/InputComposer";
import { useAgentStore } from "@/lib/store/agent-store";
import { createClient } from "@/lib/supabase/client";

export default function AgentPage() {
  const router = useRouter();
  const [isAuth, setIsAuth] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const s = useAgentStore();

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
      else { setIsAuth(true); s.loadConversations(); }
    });
  }, []);

  if (!isAuth) return null;

  const conv = s.conversations.find((c) => c.id === s.activeId);
  const title = conv?.title || "图像智能体";

  return (
    <div className="flex h-[calc(100dvh-64px)] bg-[#f8f9fb]">
      <ConversationSidebar
        conversations={s.conversations}
        activeId={s.activeId}
        onCreate={s.createConversation}
        onSwitch={s.switchConversation}
        onDelete={s.deleteConversation}
        isOpen={s.sidebarOpen}
        onClose={() => s.setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶部 */}
        <div className="flex items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-2.5 backdrop-blur-xl">
          <button onClick={() => s.setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 lg:hidden">
            <Menu className="h-4 w-4" />
          </button>
          <h1 className="truncate text-sm font-bold text-slate-800">{title}</h1>
          <div className="flex-1" />
          <button onClick={s.createConversation}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-600">
            新建对话
          </button>
        </div>

        {/* 消息区 */}
        <ChatArea
          messages={s.messages}
          sessionImages={s.inputImages}
          isSending={s.isSending}
          onOpenImage={setLightbox}
          onRetry={s.retryMessage}
        />

        {/* 输入区 */}
        <InputComposer
          inputText={s.inputText}
          inputImages={s.inputImages}
          params={s.params}
          mode={s.mode}
          isSending={s.isSending}
          estimatedCredits={s.params.count * (s.params.model === "gpt-image-2" ? 4 : 3)}
          onTextChange={s.setInputText}
          onAddImages={s.addImages}
          onRemoveImage={s.removeImage}
          onModeChange={s.setMode}
          onParamsChange={s.setParams}
          onSend={s.sendMessage}
          onAIWrite={s.aiWrite}
        />
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="预览" className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl" />
        </div>
      )}
    </div>
  );
}
