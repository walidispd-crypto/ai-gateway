"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/chat-types";
import { MessageItem } from "@/components/chat/MessageItem";
import { Icon } from "@/components/ui/Icon";

type MessageListProps = {
  conversationId: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  onRegenerate: (messageId: string) => void;
  onContinue: (messageId: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
};

export function MessageList({
  conversationId,
  messages,
  isStreaming,
  onRegenerate,
  onContinue,
  onEdit,
  onDelete,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const lastMessage = messages[messages.length - 1];
  const lastContentLength = lastMessage?.content.length ?? 0;
  const lastMessageId = lastMessage?.id ?? "";

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (lastMessage?.role === "user") pinnedToBottom.current = true;
    if (pinnedToBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
    setShowJump(!pinnedToBottom.current && element.scrollHeight > element.clientHeight);
  }, [lastMessageId, lastContentLength, messages.length, lastMessage?.role]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    pinnedToBottom.current = true;
    element.scrollTop = element.scrollHeight;
    setShowJump(false);
  }, [conversationId]);

  function onScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    pinnedToBottom.current = distance < 80;
    setShowJump(!pinnedToBottom.current && element.scrollHeight > element.clientHeight);
  }

  function jumpToBottom() {
    const element = scrollRef.current;
    if (!element) return;
    pinnedToBottom.current = true;
    element.scrollTo({ top: element.scrollHeight });
    setShowJump(false);
  }

  const lastUserIndex = [...messages].reverse().findIndex((message) => message.role === "user");
  const lastUserId =
    lastUserIndex === -1 ? null : (messages[messages.length - 1 - lastUserIndex]?.id ?? null);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain"
        role="group"
        aria-label="Percakapan"
      >
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-prose items-center px-5">
            <p className="text-[15px] text-muted">
              Tanya apa saja, tempel kode, atau tarik file teks ke sini.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-prose px-4 pb-6 pt-2 sm:px-5">
            {messages.map((message, index) => (
              <MessageItem
                key={message.id}
                message={message}
                isLast={index === messages.length - 1}
                isLastUser={message.id === lastUserId}
                isStreaming={isStreaming}
                onRegenerate={onRegenerate}
                onContinue={onContinue}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>

      {showJump ? (
        <button
          type="button"
          onClick={jumpToBottom}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded border border-line bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
        >
          <Icon name="chevron-down" size={13} />
          Ke bawah
        </button>
      ) : null}
    </div>
  );
}
