"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/chat/CodeBlock";

type MarkdownMessageProps = {
  content: string;
  streaming?: boolean;
};

function buildComponents(streaming: boolean): Components {
  return {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    // CodeBlock owns the <pre> chrome, so the default wrapper is dropped.
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children }) => {
      const text = String(children).replace(/\n$/, "");
      const language = /language-([\w+#-]+)/.exec(className ?? "")?.[1] ?? "";
      const isBlock = language.length > 0 || text.includes("\n");

      if (!isBlock) {
        return <code>{children}</code>;
      }
      return <CodeBlock code={text} language={language} streaming={streaming} />;
    },
    input: ({ checked, type }) => {
      if (type !== "checkbox") return <input type={type} />;
      return (
        <input
          type="checkbox"
          checked={Boolean(checked)}
          readOnly
          className="mr-1.5 align-middle"
        />
      );
    },
  };
}

function MarkdownMessageBase({ content, streaming = false }: MarkdownMessageProps) {
  const components = buildComponents(streaming);
  return (
    <div className="prose-chat">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {content}
      </ReactMarkdown>
      {streaming ? <span className="stream-caret" aria-hidden="true" /> : null}
    </div>
  );
}

export const MarkdownMessage = memo(MarkdownMessageBase);
