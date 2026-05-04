"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Coins, X } from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ConversationSidebar } from "@/components/agent/ConversationSidebar";
import { ChatArea } from "@/components/agent/ChatArea";
import { InputComposer } from "@/components/agent/InputComposer";
import { useAgentStore } from "@/lib/store/agent-store";
import { createClient, getCachedProfileCredits, subscribeToProfileCredits } from "@/lib/supabase/client";

export default function AgentPage() {
  const router = useRouter();
  const [isAuth, setIsAuth] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const s = useAgentStore();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
      } else {
        setIsAuth(true);
        setUserId(data.user.id);
        s.loadConversations();
        getCachedProfileCredits(data.user.id).then(setCredits);
      }
    });

    // 实时监听积分变化
    const unsub = subscribeToProfileCredits(({ credits: c }) => setCredits(c));
    return unsub;
  }, []);

  // 积分刷新：当有生成完成时刷新余额
  useEffect(() => {
    const hasCompleted = s.messages.some(
      (m) => m.generation?.status === "completed" && m.generation?.creditsUsed
    );
    if (hasCompleted && userId) {
      getCachedProfileCredits(userId).then(setCredits);
    }
  }, [s.messages, userId]);

  // Escape 键：关闭侧边栏/灯箱
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightbox) setLightbox(null);
        else if (s.sidebarOpen) s.setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox, s.sidebarOpen]);

  if (!isAuth) return null;

  const handleQuickAction = (text: string) => {
    s.setInputText(text);
    setTimeout(() => useAgentStore.getState().sendMessage(), 50);
  };

  const conv = s.conversations.find((c) => c.id === s.activeId);
  const title = conv?.title || "图像智能体";

  return (
    <div className="studio-workbench min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row">
      <FeatureTabs active="agent" />

      <ConversationSidebar
        conversations={s.conversations}
        activeId={s.activeId}
        onCreate={s.createConversation}
        onSwitch={s.switchConversation}
        onDelete={s.deleteConversation}
        isOpen={s.sidebarOpen}
        onClose={() => s.setSidebarOpen(false)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* 顶部栏 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200/60 bg-white/80 px-3 py-2 backdrop-blur-xl sm:px-4 sm:gap-3">
          <button onClick={() => s.setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 lg:hidden">
            <Menu className="h-4 w-4" />
          </button>

          <h1 className="truncate text-sm font-bold text-slate-800">{title}</h1>

          {conv?.mode && (
            <span className={`hidden shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold sm:inline-block ${
              conv.mode === "agent" ? "bg-violet-100 text-violet-600" : "bg-slate-100 text-slate-500"
            }`}>
              {conv.mode === "agent" ? "Agent" : "Chat"}
            </span>
          )}

          <div className="flex-1" />

          {/* 积分余额 */}
          {credits !== null && (
            <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-600">
              <Coins className="h-3 w-3" />
              {credits}
            </div>
          )}

          <button onClick={s.createConversation}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-violet-300 hover:text-violet-600">
            新建
          </button>
        </div>

        {/* 消息区 */}
        <ChatArea
          messages={s.messages}
          sessionImages={s.inputImages}
          isSending={s.isSending}
          onOpenImage={setLightbox}
          onRetry={s.retryMessage}
          onConfirm={s.confirmGeneration}
          onUseAsReference={(url) => {
            // 将结果图作为参考图加入下一次生成
            s.setInputText(s.inputText ? s.inputText + " " : "");
            toast.success("已添加为参考图，输入指令后发送");
          }}
          onQuickAction={handleQuickAction}
        />

        {/* 输入区 */}
        <InputComposer
          inputText={s.inputText}
          inputImages={s.inputImages}
          params={s.params}
          isSending={s.isSending}
          isAIWriting={s.isAIWriting}
          estimatedCredits={s.params.count * (s.params.model === "gpt-image-2" ? 4 : 3)}
          onTextChange={s.setInputText}
          onAddImages={s.addImages}
          onRemoveImage={s.removeImage}
          onParamsChange={s.setParams}
          onSend={s.sendMessage}
          onAIWrite={s.aiWrite}
          onPreview={setLightbox}
        />
      </div>

      {/* Lightbox — z-[999] 确保在所有元素之上 */}
      {lightbox && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 p-4 pt-16 backdrop-blur-sm"
          onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 z-[1000] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
          <img src={lightbox} alt="预览" className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl" />
        </div>
      )}
    </div>
  );
}
