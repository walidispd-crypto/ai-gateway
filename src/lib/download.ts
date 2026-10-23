const MIME_BY_EXTENSION: Record<string, string> = {
  css: "text/css",
  csv: "text/csv",
  htm: "text/html",
  html: "text/html",
  json: "application/json",
  md: "text/markdown",
  svg: "image/svg+xml",
  txt: "text/plain",
  xml: "application/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
};

function mimeFor(filename: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(filename);
  const mime = match ? MIME_BY_EXTENSION[match[1]!.toLowerCase()] : undefined;
  return mime ?? "text/plain";
}

/** Callers must pass an already sanitized name; this only adds a UTF-8 charset. */
export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: `${mimeFor(filename)};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}
