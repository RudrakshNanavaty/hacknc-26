/** Small inline icon set (24×24, stroke-based) so no icon dependency is needed. */
const paths = {
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  redo: <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
  reset: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />,
  save: <path d="M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7" />,
  records: <path d="M4 6h16M4 12h16M4 18h10" />,
  help: <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 18h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />,
  flat: <path d="M3 16h18M3 20h18" />,
  ridge: <path d="M3 18h6v-9h3v9h9M3 21h18" />,
  recess: <path d="M3 10h6v8h4v-8h8M3 21h18" />,
  step: <path d="M3 17h8v-7h10M3 21h18" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  download: <path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />,
  upload: <path d="M12 20V9m-5 5 5-5 5 5M5 4h14" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  dice: <path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8.5 8.5h.01M15.5 15.5h.01M12 12h.01" />,
  presets: <path d="M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z" />,
  results: <path d="M5 20V10M12 20V4M19 20v-7" />,
  file: <path d="M6 3h8l4 4v14H6zM14 3v4h4" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
