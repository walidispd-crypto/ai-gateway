/** Rough token estimate: ~4 characters per token holds reasonably for code and prose. */
export function estimateTokens(charCount: number): number {
  return Math.ceil(charCount / 4);
}

export function conversationCharCount(messages: { content: string }[], system?: string): number {
  const total = messages.reduce((sum, message) => sum + message.content.length, 0);
  return total + (system?.length ?? 0);
}

export function truncateForTitle(text: string, max = 60): string {
  const firstLine =
    text
      .trim()
      .split("\n")
      .find((line) => line.trim().length > 0) ?? "Percakapan baru";
  const clean = firstLine
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  const base = clean.length > 0 ? clean : "Percakapan baru";
  return base.length > max ? `${base.slice(0, max - 1).trimEnd()}…` : base;
}
