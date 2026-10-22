import type { HighlighterCore } from "shiki/core";
import type { DynamicImportLanguageRegistration } from "shiki";

export type HighlightToken = {
  content: string;
  light?: string;
  dark?: string;
  italic: boolean;
  bold: boolean;
};

export type HighlightLine = HighlightToken[];

const MAX_HIGHLIGHT_CHARS = 40_000;
const CACHE_LIMIT = 40;

const LANG_ALIASES: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  rs: "rust",
  kt: "kotlin",
  cs: "csharp",
  "c++": "cpp",
  cc: "cpp",
  h: "c",
  hpp: "cpp",
  rb: "ruby",
  patch: "diff",
  html: "html",
  svg: "xml",
  jsonc: "json",
};

const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  bash: () => import("@shikijs/langs/bash"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  css: () => import("@shikijs/langs/css"),
  diff: () => import("@shikijs/langs/diff"),
  dockerfile: () => import("@shikijs/langs/dockerfile"),
  go: () => import("@shikijs/langs/go"),
  html: () => import("@shikijs/langs/html"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsx: () => import("@shikijs/langs/jsx"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  markdown: () => import("@shikijs/langs/markdown"),
  php: () => import("@shikijs/langs/php"),
  python: () => import("@shikijs/langs/python"),
  ruby: () => import("@shikijs/langs/ruby"),
  rust: () => import("@shikijs/langs/rust"),
  scss: () => import("@shikijs/langs/scss"),
  sql: () => import("@shikijs/langs/sql"),
  swift: () => import("@shikijs/langs/swift"),
  toml: () => import("@shikijs/langs/toml"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
};

let highlighterPromise: Promise<HighlighterCore> | null = null;
const cache = new Map<string, HighlightLine[]>();

async function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, light, dark] =
      await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
        import("@shikijs/themes/github-light"),
        import("@shikijs/themes/github-dark"),
      ]);

    return createHighlighterCore({
      themes: [light, dark],
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
      warnings: false,
    });
  })();

  return highlighterPromise;
}

function resolveLanguage(language: string): string | null {
  const normalized = language
    .trim()
    .toLowerCase()
    .replace(/^language-/, "");
  const resolved = LANG_ALIASES[normalized] ?? normalized;
  return LOADERS[resolved] ? resolved : null;
}

function remember(key: string, lines: HighlightLine[]): HighlightLine[] {
  cache.set(key, lines);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return lines;
}

/**
 * Tokenises with two themes at once so the theme toggle is pure CSS and never re-highlights.
 * Returns null when the language is unknown or the block is too large to be worth the work.
 */
export async function highlightCode(
  code: string,
  language: string,
): Promise<HighlightLine[] | null> {
  if (code.length === 0 || code.length > MAX_HIGHLIGHT_CHARS) return null;
  const lang = resolveLanguage(language);
  if (!lang) return null;

  const key = `${lang}:${code}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const highlighter = await getHighlighter();
    if (!highlighter.getLoadedLanguages().includes(lang)) {
      const loader = LOADERS[lang] as DynamicImportLanguageRegistration;
      await highlighter.loadLanguage(loader);
    }

    const result = highlighter.codeToTokensWithThemes(code, {
      lang,
      themes: { light: "github-light", dark: "github-dark" },
    });

    const lines = result.map((line) =>
      line.map((token) => {
        const light = token.variants.light;
        const dark = token.variants.dark;
        const fontStyle = light?.fontStyle ?? 0;
        return {
          content: token.content,
          light: light?.color,
          dark: dark?.color,
          italic: (fontStyle & 1) !== 0,
          bold: (fontStyle & 2) !== 0,
        };
      }),
    );

    return remember(key, lines);
  } catch {
    return null;
  }
}
