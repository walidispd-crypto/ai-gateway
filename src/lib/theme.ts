export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "ai-gateway:theme";

/** Runs before paint so the first frame already has the right palette. */
export const themeBootstrapScript = `
(function () {
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    var preference = stored === "light" || stored === "dark" ? stored : "system";
    var dark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.dataset.themePreference = preference;
  } catch (error) {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return preference;
}

export function applyTheme(preference: ThemePreference): void {
  document.documentElement.dataset.theme = resolveTheme(preference);
  document.documentElement.dataset.themePreference = preference;
  localStorage.setItem(THEME_STORAGE_KEY, preference);
}
