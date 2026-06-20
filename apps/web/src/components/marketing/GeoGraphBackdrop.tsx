/**
 * GeoGraphBackdrop — decorative, on-brand background motif for hero/CTA.
 *
 * Theme: an AI citation / knowledge graph — nodes (sources & brands) linked by
 * thin edges, with a few highlighted nodes (the brands AI chose to cite). It
 * visually says "this is about how AI connects sources and picks who to name"
 * — i.e. GEO.
 *
 * GEO/perf-optimized, ALWAYS: pure inline SVG (no external request, no extra
 * round-trip), tiny, theme-aware via CSS vars (works light + dark), aria-hidden,
 * pointer-events: none, and absolutely positioned so it never causes layout
 * shift or affects LCP/crawlable content. Nodes are biased to the edges so the
 * center (headline) stays clean and legible.
 */

type Node = { x: number; y: number; r: number; hl?: "green" | "amber" };

const NODES: Node[] = [
  { x: 80, y: 70, r: 3 }, { x: 180, y: 130, r: 5, hl: "green" }, { x: 120, y: 230, r: 3 },
  { x: 260, y: 60, r: 3 }, { x: 340, y: 170, r: 4 }, { x: 60, y: 360, r: 4, hl: "amber" },
  { x: 200, y: 400, r: 3 }, { x: 1120, y: 80, r: 4 }, { x: 1040, y: 160, r: 5, hl: "green" },
  { x: 1160, y: 240, r: 3 }, { x: 980, y: 70, r: 3 }, { x: 900, y: 200, r: 4 },
  { x: 1140, y: 380, r: 4, hl: "amber" }, { x: 1000, y: 420, r: 3 }, { x: 620, y: 40, r: 3 },
  { x: 700, y: 130, r: 4, hl: "green" }, { x: 540, y: 150, r: 3 }, { x: 620, y: 460, r: 3 },
];

const EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [1, 4], [3, 4], [4, 16], [2, 5], [5, 6], [16, 15],
  [7, 8], [8, 9], [10, 8], [11, 8], [11, 12], [12, 13], [14, 15], [15, 11],
  [16, 1], [6, 17], [12, 9],
];

export function GeoGraphBackdrop({ opacity = 0.4 }: { opacity?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 520"
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        opacity, pointerEvents: "none", zIndex: 0,
      }}
    >
      <g stroke="var(--color-primary)" strokeWidth="1" opacity="0.5">
        {EDGES.map(([a, b], i) => (
          <line key={i} x1={NODES[a]!.x} y1={NODES[a]!.y} x2={NODES[b]!.x} y2={NODES[b]!.y} />
        ))}
      </g>
      {NODES.map((n, i) => (
        <circle
          key={i}
          cx={n.x}
          cy={n.y}
          r={n.r}
          fill={n.hl === "amber" ? "var(--color-accent-amber)" : "var(--color-primary)"}
          opacity={n.hl ? 0.9 : 0.45}
        />
      ))}
    </svg>
  );
}
