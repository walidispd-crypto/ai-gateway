"use client";

import { useEffect, useState } from "react";
import { applyTheme, resolveTheme, type ThemePreference } from "@/lib/theme";
import { Icon, type IconName } from "@/components/ui/Icon";

const LABELS: Record<ThemePreference, string> = {
  light: "Terang",
  dark: "Gelap",
  system: "Ikuti sistem",
};

const ICONS: Record<ThemePreference, IconName> = {
  light: "sun",
  dark: "moon",
  system: "monitor",
};

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

function readPreference(): ThemePreference {
  if (typeof document === "undefined") return "system";
  const attribute = document.documentElement.dataset.themePreference;
  if (attribute === "light" || attribute === "dark") return attribute;
  return "system";
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    setPreference(readPreference());
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      document.documentElement.dataset.theme = resolveTheme("system");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  function cycle() {
    const next = NEXT[preference];
    setPreference(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Tema: ${LABELS[preference]}. Klik untuk mengganti.`}
      title={`Tema: ${LABELS[preference]}`}
      className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-muted transition-colors hover:bg-raised hover:text-ink"
    >
      <Icon name={ICONS[preference]} size={14} />
      <span>{LABELS[preference]}</span>
    </button>
  );
}
