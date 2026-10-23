"use client";

import { useCallback, useMemo, useState } from "react";
import type { Conversation } from "@/lib/chat-types";
import { useChatStore } from "@/lib/chat-store";
import { downloadConversationMarkdown } from "@/lib/export-import";
import type { AttachmentsController } from "@/lib/use-attachments";
import type { ChatController } from "@/lib/use-chat";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { ModelPicker } from "@/components/chat/ModelPicker";
import { SystemPromptDialog } from "@/components/chat/SystemPromptDialog";
import { CustomModelField } from "@/components/chat/CustomModelField";
import { useModelLabel, useModels } from "@/components/chat/models-context";
import { useModelSuggestions } from "@/lib/use-model-suggestions";
import { useFilePanelState } from "@/lib/use-file-panel";
import { collectConversationFiles, type OpenFileTarget } from "@/lib/file-blocks";
import { FilePanel } from "@/components/chat/FilePanel";
import { Icon } from "@/components/ui/Icon";

export function ChatPanel({
  conversation,
  controller,
  attachments,
  onToggleSidebar,
  onSend,
}: {
  conversation: Conversation | null;
  controller: ChatController;
  attachments: AttachmentsController;
  onToggleSidebar: () => void;
  onSend: (text: string) => void;
}) {
  const models = useModels();
  const setModel = useChatStore((state) => state.setModel);
  const setCustomModel = useChatStore((state) => state.setCustomModel);
  const setSystem = useChatStore((state) => state.setSystem);
  const modelSuggestions = useModelSuggestions();
  const removeMessage = useChatStore((state) => state.removeMessage);
  const modelLabel = useModelLabel(conversation?.modelId ?? "");

  const [systemOpen, setSystemOpen] = useState(false);
  const [fileFocus, setFileFocus] = useState<OpenFileTarget | null>(null);
  const files = useMemo(
    () => collectConversationFiles(conversation?.messages ?? []),
    [conversation?.messages],
  );
  const filePanel = useFilePanelState(conversation?.id ?? null);
  const { openFile: openPanelOnFile } = filePanel;
  const openFile = useCallback(
    (target: OpenFileTarget) => {
      openPanelOnFile(target.name);
      setFileFocus(target);
    },
    [openPanelOnFile],
  );

  const lastMessage = conversation?.messages[conversation.messages.length - 1];
  const status =
    lastMessage?.status === "streaming"
      ? "Model sedang menjawab."
      : lastMessage?.status === "error"
        ? "Jawaban gagal. Periksa pesan error."
        : lastMessage?.status === "interrupted"
          ? "Jawaban terputus."
          : "";

  const conversationId = conversation?.id;
  const deleteMessage = useCallback(
    (messageId: string) => {
      if (!conversationId) return;
      removeMessage(conversationId, messageId);
    },
    [conversationId, removeMessage],
  );
  const {
    regenerate: runRegenerate,
    continueMessage: runContinue,
    editUserMessage: runEdit,
  } = controller;
  const regenerate = useCallback(
    (messageId: string) => void runRegenerate(messageId),
    [runRegenerate],
  );
  const continueMessage = useCallback(
    (messageId: string) => void runContinue(messageId),
    [runContinue],
  );
  const editUserMessage = useCallback(
    (messageId: string, content: string) => void runEdit(messageId, content),
    [runEdit],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
        <header className="flex shrink-0 flex-wrap items-center gap-x-1 gap-y-1 border-b border-line px-2 py-1.5 sm:px-3">
          <div className="flex min-w-0 flex-1 basis-full items-center gap-1 sm:basis-auto">
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Buka atau tutup riwayat percakapan"
              title="Riwayat percakapan"
              className="rounded p-1.5 text-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <Icon name="sidebar" size={16} />
            </button>

            <h1 className="min-w-0 flex-1 truncate px-1 text-[13px] font-medium">
              {conversation?.title ?? "Percakapan baru"}
            </h1>

            <ModelPicker
              models={models}
              value={conversation?.modelId ?? ""}
              disabled={!conversation || controller.isStreaming}
              onChange={(modelId) => {
                if (!conversation) return;
                setModel(conversation.id, modelId);
                // A saved name belongs to one provider's catalogue, so switching provider resets it.
                setCustomModel(conversation.id, undefined);
              }}
            />

            <button
              type="button"
              onClick={() => setSystemOpen(true)}
              disabled={!conversation}
              aria-label="Atur system prompt"
              title="System prompt"
              className="flex items-center gap-1.5 rounded border border-line px-2 py-1 text-xs text-muted transition-colors hover:text-ink disabled:opacity-40"
            >
              <Icon name="sliders" size={13} />
              <span className="hidden sm:inline">Sistem</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (conversation) downloadConversationMarkdown(conversation, modelLabel);
              }}
              disabled={!conversation || conversation.messages.length === 0}
              aria-label="Ekspor percakapan ini sebagai Markdown"
              title="Ekspor Markdown"
              className="rounded p-1.5 text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
            >
              <Icon name="download" size={15} />
            </button>
          </div>

          {conversation ? (
            <CustomModelField
              providerId={conversation.modelId}
              providerLabel={modelLabel}
              value={conversation.customModel}
              providers={models}
              suggestions={modelSuggestions.suggestions}
              disabled={controller.isStreaming}
              onSave={(name) => {
                setCustomModel(conversation.id, name);
                modelSuggestions.save(conversation.modelId, name);
              }}
              onReset={() => setCustomModel(conversation.id, undefined)}
              onDeleteSuggestion={modelSuggestions.remove}
            />
          ) : null}
        </header>

        <p role="status" aria-live="polite" className="sr-only">
          {status}
        </p>

        <MessageList
          conversationId={conversation?.id ?? "none"}
          messages={conversation?.messages ?? []}
          isStreaming={controller.isStreaming}
          onRegenerate={regenerate}
          onContinue={continueMessage}
          onEdit={editUserMessage}
          onDelete={deleteMessage}
          onOpenFile={openFile}
        />

        <Composer
          conversation={conversation}
          controller={controller}
          attachments={attachments}
          onSend={onSend}
        />

        <SystemPromptDialog
          open={systemOpen}
          value={conversation?.system ?? ""}
          onClose={() => setSystemOpen(false)}
          onSave={(value) => {
            if (conversation) setSystem(conversation.id, value);
          }}
        />
      </div>

      <FilePanel
        open={filePanel.open}
        files={files}
        activeName={filePanel.activeName}
        focusTarget={fileFocus}
        isStreaming={controller.isStreaming}
        onSelect={filePanel.select}
        onClose={filePanel.close}
      />
    </div>
  );
}
