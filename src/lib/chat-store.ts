"use client";

import { create } from "zustand";
import { DEFAULT_TITLE, type ChatMessage, type Conversation } from "@/lib/chat-types";

type ChatState = {
  conversations: Conversation[];
  activeId: string | null;

  hydrate: (conversations: Conversation[], activeId: string | null) => void;
  newConversation: (defaults: { modelId: string; system: string }) => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setModel: (conversationId: string, modelId: string) => void;
  setSystem: (conversationId: string, system: string) => void;

  addMessage: (conversationId: string, message: ChatMessage) => void;
  appendToMessage: (conversationId: string, messageId: string, text: string) => void;
  patchMessage: (conversationId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  updateMessageContent: (conversationId: string, messageId: string, content: string) => void;
  removeMessage: (conversationId: string, messageId: string) => void;
  truncateAfter: (conversationId: string, keepMessageId: string) => void;

  importConversations: (conversations: Conversation[]) => void;
};

function touch(conversation: Conversation, now = Date.now()): Conversation {
  return { ...conversation, updatedAt: now };
}

function mapConversation(
  conversations: Conversation[],
  id: string,
  update: (conversation: Conversation) => Conversation,
): Conversation[] {
  return conversations.map((conversation) =>
    conversation.id === id ? update(conversation) : conversation,
  );
}

function sortByRecent(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  activeId: null,

  hydrate: (conversations, activeId) => {
    const sorted = sortByRecent(conversations);
    const active = sorted.find((conversation) => conversation.id === activeId) ?? sorted[0];
    set({ conversations: sorted, activeId: active?.id ?? null });
  },

  newConversation: (defaults) => {
    const { conversations, activeId } = get();
    const active = conversations.find((conversation) => conversation.id === activeId);

    // Reuse a pristine conversation instead of stacking empty ones in the sidebar.
    if (active && active.messages.length === 0 && active.title === DEFAULT_TITLE) {
      return active.id;
    }

    const now = Date.now();
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title: DEFAULT_TITLE,
      createdAt: now,
      updatedAt: now,
      modelId: active?.modelId ?? defaults.modelId,
      system: active?.system ?? defaults.system,
      messages: [],
    };
    set({ conversations: [conversation, ...conversations], activeId: conversation.id });
    return conversation.id;
  },

  selectConversation: (id) => {
    if (get().conversations.some((conversation) => conversation.id === id)) {
      set({ activeId: id });
    }
  },

  deleteConversation: (id) => {
    set((state) => {
      const conversations = state.conversations.filter((conversation) => conversation.id !== id);
      const activeId =
        state.activeId === id ? (sortByRecent(conversations)[0]?.id ?? null) : state.activeId;
      return { conversations, activeId };
    });
  },

  renameConversation: (id, title) => {
    const clean = title.trim().slice(0, 120);
    set((state) => ({
      conversations: mapConversation(state.conversations, id, (conversation) => ({
        ...conversation,
        title: clean.length > 0 ? clean : DEFAULT_TITLE,
      })),
    }));
  },

  setModel: (conversationId, modelId) => {
    set((state) => ({
      conversations: mapConversation(state.conversations, conversationId, (conversation) => ({
        ...conversation,
        modelId,
      })),
    }));
  },

  setSystem: (conversationId, system) => {
    set((state) => ({
      conversations: mapConversation(state.conversations, conversationId, (conversation) => ({
        ...conversation,
        system,
      })),
    }));
  },

  addMessage: (conversationId, message) => {
    set((state) => ({
      conversations: mapConversation(state.conversations, conversationId, (conversation) =>
        touch({ ...conversation, messages: [...conversation.messages, message] }),
      ),
    }));
  },

  appendToMessage: (conversationId, messageId, text) => {
    if (text.length === 0) return;
    set((state) => ({
      conversations: mapConversation(state.conversations, conversationId, (conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === messageId ? { ...message, content: message.content + text } : message,
        ),
      })),
    }));
  },

  patchMessage: (conversationId, messageId, patch) => {
    set((state) => ({
      conversations: mapConversation(state.conversations, conversationId, (conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === messageId ? { ...message, ...patch } : message,
        ),
      })),
    }));
  },

  updateMessageContent: (conversationId, messageId, content) => {
    set((state) => ({
      conversations: mapConversation(state.conversations, conversationId, (conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === messageId
            ? { ...message, content, status: "complete" as const, error: undefined }
            : message,
        ),
      })),
    }));
  },

  removeMessage: (conversationId, messageId) => {
    set((state) => ({
      conversations: mapConversation(state.conversations, conversationId, (conversation) =>
        touch({
          ...conversation,
          messages: conversation.messages.filter((message) => message.id !== messageId),
        }),
      ),
    }));
  },

  truncateAfter: (conversationId, keepMessageId) => {
    set((state) => ({
      conversations: mapConversation(state.conversations, conversationId, (conversation) => {
        const index = conversation.messages.findIndex((message) => message.id === keepMessageId);
        if (index === -1) return conversation;
        return touch({ ...conversation, messages: conversation.messages.slice(0, index + 1) });
      }),
    }));
  },

  importConversations: (imported) => {
    set((state) => {
      const byId = new Map(
        state.conversations.map((conversation) => [conversation.id, conversation]),
      );
      for (const conversation of imported) byId.set(conversation.id, conversation);
      const conversations = sortByRecent([...byId.values()]);
      return { conversations, activeId: imported[0]?.id ?? state.activeId };
    });
  },
}));

export function useActiveConversation(): Conversation | null {
  return useChatStore(
    (state) =>
      state.conversations.find((conversation) => conversation.id === state.activeId) ?? null,
  );
}
