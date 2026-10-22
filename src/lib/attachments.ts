export type AttachedFile = {
  id: string;
  name: string;
  size: number;
  content: string;
};

export const MAX_FILE_BYTES = 200_000;
export const MAX_ATTACHMENTS = 5;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  bash: "bash",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  diff: "diff",
  go: "go",
  h: "c",
  hpp: "cpp",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  kt: "kotlin",
  md: "markdown",
  php: "php",
  py: "python",
  rb: "ruby",
  rs: "rust",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  txt: "",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

export class AttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentError";
  }
}

export function languageForFile(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXTENSION[extension] ?? "";
}

/** Reads a picked file as UTF-8; binary-looking content is rejected instead of being mangled. */
export async function readTextFile(file: File): Promise<AttachedFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new AttachmentError(
      `${file.name} terlalu besar (${Math.round(file.size / 1024)} KB). Batas ${MAX_FILE_BYTES / 1000} KB.`,
    );
  }

  const content = await file.text();
  if (content.slice(0, 400).includes("\u0000")) {
    throw new AttachmentError(`${file.name} tampak seperti file biner, bukan teks.`);
  }

  return { id: crypto.randomUUID(), name: file.name, size: file.size, content };
}

function fenceFor(name: string): string {
  const longest = name.includes("`") ? "~~~" : "```";
  return `${longest}${languageForFile(name)}`;
}

/** Attachments become labelled code fences so the model sees the filename and language. */
export function composeOutgoing(text: string, files: AttachedFile[]): string {
  const parts: string[] = [];
  const body = text.trim();
  if (body.length > 0) parts.push(body);

  for (const file of files) {
    const fence = fenceFor(file.name);
    const closing = fence.startsWith("~~~") ? "~~~" : "```";
    parts.push(`\`${file.name}\`\n${fence}\n${file.content.trimEnd()}\n${closing}`);
  }

  return parts.join("\n\n");
}
