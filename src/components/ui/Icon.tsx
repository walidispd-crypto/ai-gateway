export type IconName =
  | "plus"
  | "search"
  | "sidebar"
  | "send"
  | "stop"
  | "copy"
  | "check"
  | "trash"
  | "pencil"
  | "refresh"
  | "chevron-down"
  | "download"
  | "upload"
  | "logout"
  | "sun"
  | "moon"
  | "monitor"
  | "paperclip"
  | "close"
  | "wrap"
  | "alert"
  | "play"
  | "sliders";

const PATHS: Record<IconName, string[]> = {
  plus: ["M12 5v14", "M5 12h14"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.3-4.3"],
  sidebar: ["M3 5h18v14H3z", "M9 5v14"],
  send: ["M4.5 12 20 4l-4.5 16-3.5-6.5L4.5 12Z", "M12 13.5 20 4"],
  stop: ["M7 7h10v10H7z"],
  copy: ["M9 9h10v10H9z", "M5 15V5h10"],
  check: ["m4 12.5 5 5L20 6.5"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"],
  pencil: ["M4 20h4L20 8l-4-4L4 16v4Z", "m13.5 6.5 4 4"],
  refresh: ["M20 12a8 8 0 1 1-2.3-5.6", "M20 4v5h-5"],
  "chevron-down": ["m6 9 6 6 6-6"],
  download: ["M12 4v11", "m7 10 5 5 5-5", "M4 20h16"],
  upload: ["M12 20V9", "m7 14 5-5 5 5", "M4 4h16"],
  logout: ["M15 5H5v14h10", "M19 12H9", "m16 8 4 4-4 4"],
  sun: [
    "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    "M12 2v2",
    "M12 20v2",
    "M2 12h2",
    "M20 12h2",
    "m4.9 4.9 1.4 1.4",
    "m17.7 17.7 1.4 1.4",
    "m19.1 4.9-1.4 1.4",
    "m6.3 17.7-1.4 1.4",
  ],
  moon: ["M20 13.5A8.5 8.5 0 0 1 10.5 4a8.5 8.5 0 1 0 9.5 9.5Z"],
  monitor: ["M3 5h18v11H3z", "M9 20h6", "M12 16v4"],
  paperclip: [
    "m20 11-8.5 8.5a4.5 4.5 0 0 1-6.4-6.4L13.5 4a3 3 0 0 1 4.3 4.3l-8.5 8.5a1.5 1.5 0 0 1-2.1-2.1L15 6.8",
  ],
  close: ["m6 6 12 12", "m18 6-12 12"],
  wrap: ["M4 6h16", "M4 12h12a3 3 0 1 1 0 6h-3", "m11 15 2 3-2 3", "M4 18h4"],
  alert: ["M12 4 3 20h18L12 4Z", "M12 10v4", "M12 17h.01"],
  play: ["M7 4v16l13-8-13-8Z"],
  sliders: ["M4 7h10", "M18 7h2", "M4 17h4", "M12 17h8", "M14 4v6", "M8 14v6"],
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
