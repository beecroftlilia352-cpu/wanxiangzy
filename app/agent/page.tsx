"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { AgentChatPanel } from "@/components/agent/AgentChatPanel";
import { AgentInputBar } from "@/components/agent/AgentInputBar";
import { useAgentStore } from "@/lib/store/agent-store";
import { createClient } from "@/lib/supabase/client";

export default function AgentPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const messages = useAgentStore((s) => s.messages);
  const isProcessing = useAgentStore((s) => s.isProcessing);
  const pendingImages = useAgentStore((s) => s.pendingImages);
  const sendMessage = useAgentStore((s) => s.sendMessage);
  const attachImages = useAgentStore((s) => s.attachImages);
  const removePendingImage = useAgentStore((s) => s.removePendingImage);
  const confirmTask = useAgentStore((s) => s.confirmTask);
  const retryTask = useAgentStore((s) => s.retryTask);

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

  const handleSend = useCallback(
    (text: string) => {
      if (!isAuthenticated) {
        toast.error("请先登录");
        return;
      }
      sendMessage(text);
    },
    [isAuthenticated, sendMessage]
  );

  const handleFollowUp = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage]
  );

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-[calc(100dvh-64px)] flex-col bg-[#f4f5f7] lg:h-[calc(100vh-64px)] lg:flex-row">
      <FeatureTabs active="agent" />
      <div className="flex min-h-0 flex-1 flex-col">
        <AgentChatPanel
          messages={messages}
          isProcessing={isProcessing}
          onSelectTemplate={handleSend}
          onConfirm={confirmTask}
          onRetry={retryTask}
          onFollowUp={handleFollowUp}
          onOpenImage={setLightboxSrc}
        />
        <AgentInputBar
          pendingImages={pendingImages}
          isProcessing={isProcessing}
          onSend={handleSend}
          onAttachImages={attachImages}
          onRemoveImage={removePendingImage}
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
