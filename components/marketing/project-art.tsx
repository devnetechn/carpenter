const SIZE_CLASSES = {
  sm: "h-32",
  md: "h-48",
  lg: "h-72",
} as const;

type ProjectArtSize = keyof typeof SIZE_CLASSES;

function DeckPattern() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="200" fill="var(--color-muted)" />
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x={i * 42} y="0" width="34" height="200" fill="var(--color-secondary)" />
      ))}
      {Array.from({ length: 4 }).map((_, i) => (
        <line
          key={i}
          x1="0"
          y1={i * 55 + 20}
          x2="320"
          y2={i * 55 + 20}
          stroke="var(--color-accent)"
          strokeWidth="2"
          opacity="0.5"
        />
      ))}
    </svg>
  );
}

function CabinetPattern() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="200" fill="var(--color-muted)" />
      {[0, 1, 2, 3].map((col) =>
        [0, 1].map((row) => (
          <rect
            key={`${col}-${row}`}
            x={col * 80 + 6}
            y={row * 100 + 6}
            width="68"
            height="88"
            rx="3"
            fill="var(--color-secondary)"
            stroke="var(--color-accent)"
            strokeWidth="1.5"
          />
        ))
      )}
      {[0, 1, 2, 3].map((col) => (
        <circle key={col} cx={col * 80 + 62} cy="50" r="2.5" fill="var(--color-accent)" />
      ))}
    </svg>
  );
}

function BuiltInPattern() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="200" fill="var(--color-muted)" />
      {[0, 1, 2, 3, 4].map((row) => (
        <rect key={row} x="10" y={row * 38 + 6} width="300" height="6" fill="var(--color-accent)" opacity="0.6" />
      ))}
      {[70, 150, 230].map((x) => (
        <rect key={x} x={x} y="6" width="6" height="188" fill="var(--color-secondary)" />
      ))}
    </svg>
  );
}

function RemodelPattern() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="200" fill="var(--color-muted)" />
      <polyline
        points="10,190 10,40 160,10 310,40 310,190"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
      />
      <line x1="10" y1="120" x2="310" y2="120" stroke="var(--color-secondary)" strokeWidth="2" />
      <line x1="160" y1="10" x2="160" y2="190" stroke="var(--color-secondary)" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}

function DefaultPattern() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="200" fill="var(--color-muted)" />
      {Array.from({ length: 6 }).map((_, i) => (
        <path
          key={i}
          d={`M0 ${i * 36 + 10} Q 80 ${i * 36 - 10}, 160 ${i * 36 + 10} T 320 ${i * 36 + 10}`}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          opacity="0.5"
        />
      ))}
    </svg>
  );
}

const PATTERNS: Record<string, () => React.ReactElement> = {
  "deck-construction": DeckPattern,
  "custom-cabinets": CabinetPattern,
  "built-ins": BuiltInPattern,
  remodeling: RemodelPattern,
};

export function ProjectArt({
  service,
  size = "md",
  className,
}: {
  service: string;
  size?: ProjectArtSize;
  className?: string;
}) {
  const Pattern = PATTERNS[service] ?? DefaultPattern;
  return (
    <div className={`overflow-hidden rounded-lg ${SIZE_CLASSES[size]} ${className ?? ""}`}>
      <Pattern />
    </div>
  );
}
