/**
 * Files are derived from the message text on every render, so the storage schema never changes.
 * Two sources are recognised: the `<file name="..." lang="...">` convention that the "Mode file"
 * preset teaches, and long fenced code blocks as a fallback for models that ignore it.
 */

export const FILE_OPEN_TOKEN = "<file";
export const FILE_CLOSE_TOKEN = "</file>";
/** Fenced blocks longer than this are offered in the panel instead of the bubble. */
export const LONG_FENCE_LINES = 30;

const MAX_FILE_NAME_LENGTH = 120;

export type ParsedFile = {
  name: string;
  language: string;
  content: string;
  /** False while the closing token has not arrived yet (streaming, stopped, or truncated). */
  complete: boolean;
  source: "tag" | "fence";
  /** Position among file blocks inside one message; stable because messages only ever grow. */
  index: number;
};

export type MessageBlock = { kind: "text"; text: string } | { kind: "file"; file: ParsedFile };

/** Name without directories or characters that would be dangerous in a download path. */
export function sanitizeFileName(raw: string, fallback = "file.txt"): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*`$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, MAX_FILE_NAME_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

type LanguageInfo = { language: string; badge: string };

const BY_EXTENSION: Record<string, LanguageInfo> = {
  bash: { language: "bash", badge: "SH" },
  c: { language: "c", badge: "C" },
  cc: { language: "cpp", badge: "C++" },
  cpp: { language: "cpp", badge: "C++" },
  cs: { language: "csharp", badge: "C#" },
  css: { language: "css", badge: "CSS" },
  diff: { language: "diff", badge: "DIFF" },
  go: { language: "go", badge: "GO" },
  h: { language: "c", badge: "C" },
  hpp: { language: "cpp", badge: "C++" },
  htm: { language: "html", badge: "HTML" },
  html: { language: "html", badge: "HTML" },
  java: { language: "java", badge: "JAVA" },
  js: { language: "javascript", badge: "JS" },
  json: { language: "json", badge: "JSON" },
  jsx: { language: "jsx", badge: "JSX" },
  kt: { language: "kotlin", badge: "KT" },
  md: { language: "markdown", badge: "MD" },
  mjs: { language: "javascript", badge: "JS" },
  patch: { language: "diff", badge: "DIFF" },
  php: { language: "php", badge: "PHP" },
  py: { language: "python", badge: "PY" },
  rb: { language: "ruby", badge: "RB" },
  rs: { language: "rust", badge: "RS" },
  scss: { language: "scss", badge: "SCSS" },
  sh: { language: "bash", badge: "SH" },
  sql: { language: "sql", badge: "SQL" },
  svg: { language: "xml", badge: "SVG" },
  swift: { language: "swift", badge: "SWIFT" },
  toml: { language: "toml", badge: "TOML" },
  ts: { language: "typescript", badge: "TS" },
  tsx: { language: "tsx", badge: "TSX" },
  txt: { language: "text", badge: "TXT" },
  xml: { language: "xml", badge: "XML" },
  yaml: { language: "yaml", badge: "YAML" },
  yml: { language: "yaml", badge: "YAML" },
};

/** Shiki aliases we accept from the `lang` attribute or a fence info string. */
const LANGUAGE_ALIASES: Record<string, string> = {
  cjs: "javascript",
  javascript: "javascript",
  js: "javascript",
  json: "json",
  csharp: "csharp",
  cs: "csharp",
  html: "html",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  python: "python",
  rs: "rust",
  rust: "rust",
  sh: "bash",
  bash: "bash",
  shell: "bash",
  svg: "xml",
  ts: "typescript",
  typescript: "typescript",
  tsx: "tsx",
  txt: "text",
  yml: "yaml",
  yaml: "yaml",
};

function extensionOf(name: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(name);
  return match ? match[1]!.toLowerCase() : "";
}

/** Languages without a file extension still need a readable badge. */
const EXTRA_BADGES: Record<string, string> = {
  dockerfile: "DOCKER",
  ini: "INI",
  makefile: "MK",
  plaintext: "TXT",
  text: "TXT",
};

const BADGES_BY_LANGUAGE: Record<string, string> = (() => {
  const badges: Record<string, string> = {};
  for (const info of Object.values(BY_EXTENSION)) badges[info.language] ??= info.badge;
  return badges;
})();

export function languageForFile(name: string, hint?: string): string {
  const normalizedHint = (hint ?? "")
    .trim()
    .toLowerCase()
    .replace(/^language-/, "");
  if (normalizedHint.length > 0) {
    const alias = LANGUAGE_ALIASES[normalizedHint];
    if (alias) return alias;
    if (/^[a-z0-9+#-]{1,20}$/.test(normalizedHint)) return normalizedHint;
  }
  return BY_EXTENSION[extensionOf(name)]?.language ?? "text";
}

export function languageBadge(name: string, hint?: string): string {
  const language = languageForFile(name, hint);
  const badge =
    BY_EXTENSION[extensionOf(name)]?.badge ??
    BADGES_BY_LANGUAGE[language] ??
    EXTRA_BADGES[language];
  return (badge ?? language).toUpperCase().slice(0, 6);
}

export function countLines(content: string): number {
  if (content.length === 0) return 0;
  const body = content.endsWith("\n") ? content.slice(0, -1) : content;
  return body.length === 0 ? 1 : body.split("\n").length;
}

export type PreviewKind = "html" | "markdown" | "svg";

/** Which preview, if any, the panel can offer for this file. */
export function previewKindFor(name: string, language: string): PreviewKind | null {
  const extension = extensionOf(name);
  if (extension === "md" || extension === "markdown" || extension === "mdx") return "markdown";
  if (extension === "html" || extension === "htm") return "html";
  if (extension === "svg") return "svg";
  if (extension.length === 0) {
    if (language === "markdown") return "markdown";
    if (language === "html") return "html";
    if (language === "xml" && /<svg[\s>]/i.test(name)) return "svg";
  }
  return null;
}

const PREVIEW_CSP =
  "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; media-src data:;";

/**
 * Sandboxed previews get their own policy because the parent CSP is inherited by `srcdoc`
 * documents: the frame may use inline CSS and data images, but nothing else — no scripts,
 * no fetch, no external images, fonts, or stylesheets.
 */
export function buildPreviewDocument(
  content: string,
  kind: Exclude<PreviewKind, "markdown">,
): string {
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
  if (kind === "svg") {
    return `<!doctype html><html><head>${head}<style>html,body{margin:0;height:100%;display:grid;place-items:center;background:#fff}svg{max-width:100%;max-height:100%}</style></head><body>${content}</body></html>`;
  }
  return `<!doctype html><html><head>${head}<style>html{color-scheme:light}body{margin:0;padding:16px;background:#fff;color:#111;font:15px/1.6 system-ui,sans-serif}img{max-width:100%}</style></head><body>${content}</body></html>`;
}

function readAttributes(source: string): { name?: string; lang?: string } {
  const result: { name?: string; lang?: string } = {};
  const pattern = /([A-Za-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const key = match[1]!.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (key === "name" || key === "file" || key === "title") {
      result.name ??= value;
    } else if (key === "lang" || key === "language") {
      result.lang ??= value;
    }
  }
  return result;
}

function looksLikeFileName(token: string): boolean {
  return /[A-Za-z0-9_-]\.[A-Za-z0-9]{1,8}$/.test(token) || token.includes("/");
}

function unquote(value: string): string {
  return value.replace(/^["'`]+|["'`]+$/g, "").trim();
}

function parseFenceInfo(info: string, index: number): { name: string; language: string } {
  // Supports ```ts models.ts, ```ts title="models.ts", and ```{.ts file="models.ts"}.
  const normalized = info.replace(/^\{\.?([\w+#-]+)([^}]*)\}$/, "$1 $2").trim();
  const tokens = normalized.split(/\s+/).filter(Boolean);

  const named = tokens
    .map((token) => /^(?:name|file|title)=(.+)$/i.exec(token))
    .find((match): match is RegExpExecArray => match !== null);

  let name: string | undefined;
  if (named) name = unquote(named[1]!);
  if (!name) {
    const candidate = tokens.find(
      (token, tokenIndex) => tokenIndex > 0 && looksLikeFileName(token),
    );
    if (candidate) name = unquote(candidate);
  }

  const first = tokens[0] ?? "";
  const language = languageForFile(name ?? `cuplikan.${first}`, first);
  if (!name) {
    const extension = extensionOf(`x.${first}`) || "txt";
    name = `cuplikan-${index}.${extension}`;
  }
  return { name: sanitizeFileName(name, `cuplikan-${index}.txt`), language };
}

type Fence = {
  info: string;
  bodyStart: number;
  bodyEnd: number;
  next: number;
  closed: boolean;
};

function readFence(content: string, start: number): Fence | null {
  const marker = content[start];
  if (marker !== "`" && marker !== "~") return null;
  let markerLength = 0;
  while (content[start + markerLength] === marker) markerLength += 1;
  if (markerLength < 3) return null;

  const lineEnd = content.indexOf("\n", start);
  const info = content
    .slice(start + markerLength, lineEnd === -1 ? content.length : lineEnd)
    .trim();
  if (lineEnd === -1) {
    return {
      info,
      bodyStart: content.length,
      bodyEnd: content.length,
      next: content.length,
      closed: false,
    };
  }

  const bodyStart = lineEnd + 1;
  const closer = new RegExp(`^ {0,3}${marker}{${markerLength},}[ \\t]*$`, "m");
  const match = closer.exec(content.slice(bodyStart));
  if (!match) {
    return {
      info,
      bodyStart,
      // An unfinished fence keeps accumulating into the panel while streaming, and stays
      // readable when the stream was stopped or truncated.
      bodyEnd: content.length,
      next: content.length,
      closed: false,
    };
  }

  return {
    info,
    bodyStart,
    bodyEnd: bodyStart + match.index,
    next: bodyStart + match.index + match[0].length,
    closed: true,
  };
}

function stripTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

/**
 * The newline that follows the opening tag and the one before the closing tag are formatting,
 * not content: trimming them keeps line counts and downloads honest.
 */
function trimBlockBody(body: string, complete: boolean): string {
  let text = body.startsWith("\r\n") ? body.slice(2) : body.startsWith("\n") ? body.slice(1) : body;
  if (!complete) return text;
  if (text.endsWith("\r\n")) text = text.slice(0, -2);
  else if (text.endsWith("\n")) text = text.slice(0, -1);
  return text;
}

function stripPartialTokenTail(text: string, token: string): string {
  const limit = Math.min(token.length - 1, text.length);
  for (let length = limit; length > 0; length -= 1) {
    if (token.startsWith(text.slice(-length))) return text.slice(0, -length);
  }
  return text;
}

/** True when the tail can still become an opening tag: `<`, `<f`, `<file`, `<file name="a`. */
function isPartialFileTag(tail: string): boolean {
  const lower = tail.toLowerCase();
  if (lower.length < FILE_OPEN_TOKEN.length) return FILE_OPEN_TOKEN.startsWith(lower);
  if (!lower.startsWith(FILE_OPEN_TOKEN)) return false;
  return !lower.includes(">");
}

function isLineStart(content: string, index: number): boolean {
  if (index === 0) return true;
  const previous = content[index - 1];
  return previous === "\n";
}

function pushText(blocks: MessageBlock[], text: string): void {
  if (text.trim().length === 0) {
    // Whitespace between blocks still separates markdown paragraphs.
    const previous = blocks[blocks.length - 1];
    if (previous?.kind === "text") previous.text += text;
    return;
  }
  const previous = blocks[blocks.length - 1];
  if (previous?.kind === "text") previous.text += text;
  else blocks.push({ kind: "text", text });
}

export function parseMessageBlocks(content: string, streaming = false): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let textStart = 0;
  let cursor = 0;
  let fileIndex = 0;

  const flush = (end: number) => {
    pushText(blocks, content.slice(textStart, end));
  };

  const addFile = (file: Omit<ParsedFile, "index">) => {
    flush(cursor);
    blocks.push({ kind: "file", file: { ...file, index: fileIndex } });
    fileIndex += 1;
  };

  while (cursor < content.length) {
    const char = content[cursor];

    if ((char === "`" || char === "~") && isLineStart(content, cursor)) {
      const fence = readFence(content, cursor);
      if (fence) {
        const body = stripTrailingNewline(content.slice(fence.bodyStart, fence.bodyEnd));
        if (countLines(body) > LONG_FENCE_LINES) {
          const { name, language } = parseFenceInfo(fence.info, fileIndex + 1);
          addFile({
            name,
            language,
            content: body,
            complete: fence.closed,
            source: "fence",
          });
          textStart = fence.next;
          cursor = fence.next;
          continue;
        }
        // Short fences and fences still being written stay as markdown; skipping them also
        // keeps tag-like text inside a documented example from being parsed as a file.
        cursor = fence.next;
        continue;
      }
    }

    if (char === "<") {
      const tail = content.slice(cursor);
      const open = /^<file(?=[\s>])([^>]*)>/i.exec(tail);
      if (open) {
        const attributes = readAttributes(open[1] ?? "");
        const bodyStart = cursor + open[0].length;
        const rest = content.slice(bodyStart);
        const closeAt = rest.indexOf(FILE_CLOSE_TOKEN);
        // A tag without a name still deserves a card; the extension comes from `lang`.
        const generatedName = `file-${fileIndex + 1}.${extensionOf(`x.${attributes.lang ?? "txt"}`) || "txt"}`;
        const name = sanitizeFileName(attributes.name ?? "", generatedName);

        if (closeAt >= 0) {
          addFile({
            name,
            language: languageForFile(name, attributes.lang),
            content: trimBlockBody(rest.slice(0, closeAt), true),
            complete: true,
            source: "tag",
          });
          cursor = bodyStart + closeAt + FILE_CLOSE_TOKEN.length;
        } else {
          const body = streaming ? stripPartialTokenTail(rest, FILE_CLOSE_TOKEN) : rest;
          addFile({
            name,
            language: languageForFile(name, attributes.lang),
            content: trimBlockBody(body, false),
            complete: false,
            source: "tag",
          });
          cursor = content.length;
        }
        textStart = cursor;
        continue;
      }

      if (streaming && isPartialFileTag(tail)) {
        // The tag itself is split across deltas: show a live card instead of leaking `<file name=`.
        const attributes = readAttributes(tail.slice(FILE_OPEN_TOKEN.length));
        const name = sanitizeFileName(attributes.name ?? "", `file-${fileIndex + 1}.txt`);
        addFile({
          name,
          language: languageForFile(name, attributes.lang),
          content: "",
          complete: false,
          source: "tag",
        });
        cursor = content.length;
        textStart = cursor;
        continue;
      }
    }

    cursor += 1;
  }

  flush(content.length);
  return blocks.filter((block) => block.kind === "file" || block.text.trim().length > 0);
}

/**
 * Reparsing every message on every streamed token is wasteful; unchanged messages keep the same
 * content string, so an identity check makes the cache hit cheap.
 */
const parseCache = new Map<
  string,
  { content: string; streaming: boolean; blocks: MessageBlock[] }
>();
const PARSE_CACHE_LIMIT = 60;

export function parseMessageBlocksCached(
  messageId: string,
  content: string,
  streaming: boolean,
): MessageBlock[] {
  const hit = parseCache.get(messageId);
  if (hit && hit.content === content && hit.streaming === streaming) return hit.blocks;

  const blocks = parseMessageBlocks(content, streaming);
  parseCache.set(messageId, { content, streaming, blocks });
  if (parseCache.size > PARSE_CACHE_LIMIT) {
    const oldest = parseCache.keys().next().value;
    if (oldest !== undefined) parseCache.delete(oldest);
  }
  return blocks;
}

export type FileVersion = {
  content: string;
  complete: boolean;
  language: string;
  messageId: string;
  blockIndex: number;
  lineCount: number;
};

export type ConversationFile = {
  name: string;
  /** Oldest first; the last entry is the newest revision. */
  versions: FileVersion[];
  language: string;
  badge: string;
};

type FileSourceMessage = {
  id: string;
  role: string;
  content: string;
  status: string;
};

export function collectConversationFiles(messages: FileSourceMessage[]): ConversationFile[] {
  const files = new Map<string, ConversationFile>();

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of parseMessageBlocksCached(
      message.id,
      message.content,
      message.status === "streaming",
    )) {
      if (block.kind !== "file") continue;
      const { file } = block;
      const existing = files.get(file.name);
      const version: FileVersion = {
        content: file.content,
        complete: file.complete,
        language: file.language,
        messageId: message.id,
        blockIndex: file.index,
        lineCount: countLines(file.content),
      };
      if (existing) {
        existing.versions.push(version);
        existing.language = file.language;
        existing.badge = languageBadge(file.name, file.language);
      } else {
        files.set(file.name, {
          name: file.name,
          versions: [version],
          language: file.language,
          badge: languageBadge(file.name, file.language),
        });
      }
    }
  }

  return [...files.values()];
}

export type OpenFileTarget = { name: string; messageId: string; blockIndex: number };
