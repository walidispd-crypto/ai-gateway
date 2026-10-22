export type SseBoundary = { index: number; length: number };

/** Finds the next blank-line separator, tolerating both LF and CRLF. */
export function findEventBoundary(buffer: string): SseBoundary | null {
  const match = /\r?\n\r?\n/.exec(buffer);
  if (!match || match.index === undefined) return null;
  return { index: match.index, length: match[0].length };
}

/** Extracts the payload of one raw SSE event; non-`data` fields are ignored. */
export function parseEventData(rawEvent: string): string | null {
  const dataLines: string[] = [];
  for (const line of rawEvent.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const value = line.slice(5);
    dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
  }
  if (dataLines.length === 0) return null;
  return dataLines.join("\n");
}

/**
 * Turns a byte stream into the `data` payload of each SSE event.
 * Some Workers close the stream without a trailing blank line, so the tail is flushed.
 */
export async function* readSseData(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const drain = function* (): Generator<string> {
    for (;;) {
      const boundary = findEventBoundary(buffer);
      if (!boundary) return;
      const rawEvent = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.length);
      const data = parseEventData(rawEvent);
      if (data !== null) yield data;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      if (done) {
        buffer += decoder.decode();
        const tail = parseEventData(buffer);
        yield* drain();
        if (tail !== null) yield tail;
        return;
      }
      yield* drain();
    }
  } finally {
    reader.releaseLock();
  }
}
