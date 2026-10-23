"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_TITLE, type ChatMessage, type Conversation } from "@/lib/chat-types";
import { useChatStore } from "@/lib/chat-store";
import type { ChatMessageInput } from "@/lib/protocol";
import { ChatRequestError, streamChat } from "@/lib/stream-client";
import { defaultContextLimit, selectContext } from "@/lib/context";
import { truncateForTitle } from "@/lib/text";
import { composeOutgoing, type AttachedFile } from "@/lib/attachments";
import type { PublicModel } from "@/config/models";

const CONTINUE_INSTRUCTION =
  "Lanjutkan jawaban tepat dari titik terakhir. Jangan mengulang teks yang sudah ada.";

const DELTA_FLUSH_MS = 40;

type TextBatcher = {
  push: (text: string) => void;
  flush: () => void;
};

function createTextBatcher(emit: (text: string) => void): TextBatcher {
  let buffer = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (buffer.length === 0) return;
    const text = buffer;
    buffer = "";
    emit(text);
  };

  return {
    push: (text) => {
      buffer += text;
      if (!timer) timer = setTimeout(flush, DELTA_FLUSH_MS);
    },
    flush,
  };
}

type RunArgs = {
  conversationId: string;
  assistantId: string;
  history: ChatMessage[];
  instruction?: string;
};

export type ChatController = {
  isStreaming: boolean;
  trimNotice: string | null;
  send: (text: string, files?: AttachedFile[]) => Promise<void>;
  stop: () => void;
  regenerate: (messageId: string) => Promise<void>;
  editUserMessage: (messageId: string, content: string) => Promise<void>;
  continueMessage: (messageId: string) => Promise<void>;
  dismissTrimNotice: () => void;
};

export function useChat({
  models,
  defaultModelId,
  defaultSystem,
}: {
  models: PublicModel[];
  defaultModelId: string;
  defaultSystem: string;
}): ChatController {
  const [isStreaming, setIsStreaming] = useState(false);
  const [trimNotice, setTrimNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const ensureActiveConversation = useCallback((): string => {
    const state = useChatStore.getState();
    if (state.activeId) return state.activeId;
    return state.newConversation({ modelId: defaultModelId, system: defaultSystem });
  }, [defaultModelId, defaultSystem]);

  const run = useCallback(
    async ({ conversationId, assistantId, history, instruction }: RunArgs) => {
      if (busyRef.current) return;

      const state = useChatStore.getState();
      const conversation = state.conversations.find((item) => item.id === conversationId);
      if (!conversation) return;

      const model = models.find((item) => item.id === conversation.modelId) ?? models[0];
      if (!model) {
        state.patchMessage(conversationId, assistantId, {
          status: "error",
          error: "Belum ada model yang terkonfigurasi.",
          errorCode: "config",
        });
        return;
      }

      const selection = selectContext(
        history,
        conversation.system,
        defaultContextLimit(model.maxContextChars),
      );
      const messages: ChatMessageInput[] = [...selection.messages];
      if (instruction) messages.push({ role: "user", content: instruction });

      setTrimNotice(
        selection.droppedCount > 0
          ? `${selection.droppedCount} pesan lama tidak dikirim karena batas konteks ${model.label}.`
          : null,
      );

      const controller = new AbortController();
      abortRef.current = controller;
      busyRef.current = true;
      setIsStreaming(true);

      const batcher = createTextBatcher((text) => {
        useChatStore.getState().appendToMessage(conversationId, assistantId, text);
      });

      let sawDone = false;
      let sawError = false;

      try {
        await streamChat(
          {
            modelId: model.id,
            system: conversation.system.trim().length > 0 ? conversation.system : undefined,
            customModel: conversation.customModel,
            messages,
          },
          {
            signal: controller.signal,
            onEvent: (event) => {
              switch (event.type) {
                case "meta":
                  batcher.flush();
                  useChatStore.getState().patchMessage(conversationId, assistantId, {
                    modelLabel: event.modelLabel,
                    modelName: event.modelName,
                    fallbackFromLabel: event.fallbackFrom?.modelLabel,
                  });
                  break;
                case "delta":
                  batcher.push(event.text);
                  break;
                case "error":
                  batcher.flush();
                  sawError = true;
                  useChatStore.getState().patchMessage(conversationId, assistantId, {
                    status: "error",
                    error: event.message,
                    errorCode: event.code,
                  });
                  break;
                case "done":
                  batcher.flush();
                  sawDone = true;
                  useChatStore.getState().patchMessage(conversationId, assistantId, {
                    status: "complete",
                    error: undefined,
                    errorCode: undefined,
                  });
                  break;
              }
            },
          },
        );

        batcher.flush();
        if (!sawDone && !sawError) {
          markInterrupted(conversationId, assistantId, "Koneksi berakhir sebelum jawaban selesai.");
        }
      } catch (error) {
        batcher.flush();
        if (controller.signal.aborted) {
          markInterrupted(conversationId, assistantId);
        } else {
          if (error instanceof ChatRequestError && error.status === 401) {
            window.location.assign("/login");
          }
          const message =
            error instanceof ChatRequestError
              ? error.message
              : "Koneksi ke server terputus sebelum jawaban selesai.";
          useChatStore.getState().patchMessage(conversationId, assistantId, {
            status: sawError ? "error" : "interrupted",
            error: message,
            errorCode: "network",
          });
        }
      } finally {
        batcher.flush();
        abortRef.current = null;
        busyRef.current = false;
        setIsStreaming(false);
      }
    },
    [models],
  );

  const send = useCallback(
    async (text: string, files: AttachedFile[] = []) => {
      if (busyRef.current) return;
      const content = composeOutgoing(text, files);
      if (content.trim().length === 0) return;

      const conversationId = ensureActiveConversation();
      const state = useChatStore.getState();
      const conversation = state.conversations.find((item) => item.id === conversationId);
      if (!conversation) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        createdAt: Date.now(),
        status: "complete",
      };
      state.addMessage(conversationId, userMessage);

      if (conversation.title === DEFAULT_TITLE) {
        const titleSource = text.trim().length > 0 ? text : (files[0]?.name ?? content);
        state.renameConversation(conversationId, truncateForTitle(titleSource));
      }

      const assistant = createAssistantMessage();
      state.addMessage(conversationId, assistant);

      await run({
        conversationId,
        assistantId: assistant.id,
        history: [...conversation.messages, userMessage],
      });
    },
    [ensureActiveConversation, run],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const regenerate = useCallback(
    async (messageId: string) => {
      if (busyRef.current) return;
      const state = useChatStore.getState();
      const conversation = findConversationForMessage(messageId);
      if (!conversation) return;

      const index = conversation.messages.findIndex((message) => message.id === messageId);
      const target = conversation.messages[index];
      if (!target || target.role !== "assistant" || index === 0) return;

      const history = conversation.messages.slice(0, index);
      const previous = history[history.length - 1];
      if (!previous) return;

      state.truncateAfter(conversation.id, previous.id);
      const assistant = createAssistantMessage();
      useChatStore.getState().addMessage(conversation.id, assistant);

      await run({ conversationId: conversation.id, assistantId: assistant.id, history });
    },
    [run],
  );

  const editUserMessage = useCallback(
    async (messageId: string, content: string) => {
      if (busyRef.current) return;
      const trimmed = content.trim();
      if (trimmed.length === 0) return;

      const conversation = findConversationForMessage(messageId);
      if (!conversation) return;
      const index = conversation.messages.findIndex((message) => message.id === messageId);
      const target = conversation.messages[index];
      if (!target || target.role !== "user") return;

      const state = useChatStore.getState();
      state.updateMessageContent(conversation.id, messageId, trimmed);
      state.truncateAfter(conversation.id, messageId);

      const history = [
        ...conversation.messages.slice(0, index),
        { ...target, content: trimmed, status: "complete" as const },
      ];
      const assistant = createAssistantMessage();
      state.addMessage(conversation.id, assistant);

      await run({ conversationId: conversation.id, assistantId: assistant.id, history });
    },
    [run],
  );

  const continueMessage = useCallback(
    async (messageId: string) => {
      if (busyRef.current) return;
      const conversation = findConversationForMessage(messageId);
      if (!conversation) return;
      const index = conversation.messages.findIndex((message) => message.id === messageId);
      const target = conversation.messages[index];
      if (!target || target.role !== "assistant" || target.content.trim().length === 0) return;

      const state = useChatStore.getState();
      state.patchMessage(conversation.id, messageId, {
        status: "streaming",
        error: undefined,
        errorCode: undefined,
      });

      await run({
        conversationId: conversation.id,
        assistantId: messageId,
        history: conversation.messages.slice(0, index + 1),
        instruction: CONTINUE_INSTRUCTION,
      });
    },
    [run],
  );

  const dismissTrimNotice = useCallback(() => setTrimNotice(null), []);

  return {
    isStreaming,
    trimNotice,
    send,
    stop,
    regenerate,
    editUserMessage,
    continueMessage,
    dismissTrimNotice,
  };
}

function createAssistantMessage(): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "",
    createdAt: Date.now(),
    status: "streaming",
  };
}

function findConversationForMessage(messageId: string): Conversation | undefined {
  return useChatStore
    .getState()
    .conversations.find((conversation) =>
      conversation.messages.some((message) => message.id === messageId),
    );
}

function markInterrupted(conversationId: string, assistantId: string, error?: string): void {
  const store = useChatStore.getState();
  const conversation = store.conversations.find((item) => item.id === conversationId);
  const message = conversation?.messages.find((item) => item.id === assistantId);
  if (!message) return;

  if (message.content.trim().length === 0) {
    store.removeMessage(conversationId, assistantId);
    return;
  }
  store.patchMessage(conversationId, assistantId, {
    status: "interrupted",
    error,
    errorCode: error ? "network" : undefined,
  });
}
