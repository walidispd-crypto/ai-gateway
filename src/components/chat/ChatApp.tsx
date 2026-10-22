"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicModel } from "@/config/models";
import { useActiveConversation, useChatStore } from "@/lib/chat-store";
import { flushSave, loadChatState, scheduleSave } from "@/lib/chat-storage";
import { useChat } from "@/lib/use-chat";
import { useAttachments } from "@/lib/use-attachments";
import { ModelRegistryProvider } from "@/components/chat/models-context";
import { Sidebar } from "@/components/chat/Sidebar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Icon } from "@/components/ui/Icon";

export function ChatApp({
  models,
  defaultModelId,
  defaultSystem,
}: {
  models: PublicModel[];
  defaultModelId: string;
  defaultSystem: string;
}) {
  return (
    <ModelRegistryProvider models={models}>
      <ChatAppInner models={models} defaultModelId={defaultModelId} defaultSystem={defaultSystem} />
    </ModelRegistryProvider>
  );
}

function ChatAppInner({
  models,
  defaultModelId,
  defaultSystem,
}: {
  models: PublicModel[];
  defaultModelId: string;
  defaultSystem: string;
}) {
  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);

  const conversation = useActiveConversation();
  const conversationCount = useChatStore((state) => state.conversations.length);
  const initialModelId = models.some((model) => model.id === defaultModelId)
    ? defaultModelId
    : (models[0]?.id ?? "");
  const controller = useChat({ models, defaultModelId: initialModelId, defaultSystem });
  const attachments = useAttachments();
  const dragDepth = useRef(0);

  useEffect(() => {
    let alive = true;
    const restore = (stored: Awaited<ReturnType<typeof loadChatState>>) => {
      const store = useChatStore.getState();
      store.hydrate(stored?.conversations ?? [], stored?.activeId ?? null);

      // A registry edit can retire a model id that older conversations still reference.
      if (initialModelId) {
        for (const item of store.conversations) {
          if (!models.some((model) => model.id === item.modelId)) {
            store.setModel(item.id, initialModelId);
          }
        }
      }
      if (useChatStore.getState().conversations.length === 0) {
        useChatStore.getState().newConversation({ modelId: initialModelId, system: defaultSystem });
      }
    };

    void loadChatState()
      .then((stored) => {
        if (alive) restore(stored);
      })
      .catch(() => {
        if (alive) restore(null);
      })
      .finally(() => {
        if (alive) setReady(true);
      });

    return () => {
      alive = false;
    };
  }, [initialModelId, defaultSystem, models]);

  useEffect(() => {
    if (!ready) return;

    const unsubscribe = useChatStore.subscribe((state, previous) => {
      if (state.conversations === previous.conversations && state.activeId === previous.activeId) {
        return;
      }
      scheduleSave({ conversations: state.conversations, activeId: state.activeId });
    });

    const onHide = () => flushSave();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      flushSave();
    };
  }, [ready]);

  // Deleting the last conversation leaves an empty shell; keep one draft open instead.
  useEffect(() => {
    if (!ready || conversationCount > 0) return;
    useChatStore.getState().newConversation({ modelId: initialModelId, system: defaultSystem });
  }, [ready, conversationCount, initialModelId, defaultSystem]);

  const startNewConversation = useCallback(() => {
    useChatStore.getState().newConversation({ modelId: initialModelId, system: defaultSystem });
    setDrawerOpen(false);
  }, [initialModelId, defaultSystem]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("dialog")) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        startNewConversation();
        return;
      }
      if (event.key === "Escape" && controller.isStreaming) {
        event.preventDefault();
        controller.stop();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller, startNewConversation]);

  function toggleSidebar() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setCollapsed((value) => !value);
    } else {
      setDrawerOpen((value) => !value);
    }
  }

  function onDragEnter(event: React.DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragOver(event: React.DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(event: React.DragEvent) {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void attachments.addFiles(event.dataTransfer.files);
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        open={drawerOpen}
        collapsed={collapsed}
        onClose={() => setDrawerOpen(false)}
        onNewConversation={startNewConversation}
      />

      <main
        className="relative flex min-h-0 min-w-0 flex-1 flex-col"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <ChatPanel
          conversation={conversation}
          controller={controller}
          attachments={attachments}
          onToggleSidebar={toggleSidebar}
          onSend={(text) => {
            void controller.send(text, attachments.files);
          }}
        />

        {dragging ? (
          <div className="bg-canvas/80 pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="flex items-center gap-2 rounded border border-accent bg-surface px-4 py-2.5 text-sm text-muted">
              <Icon name="paperclip" size={15} />
              Lepaskan file teks untuk dilampirkan
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
