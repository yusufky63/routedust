import { ImageResponse } from "next/og";

export const alt = "RouteDust — testnet router";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0b0c0e";
const TEXT = "#f2f1ec";
const MUTED = "#8b8e96";
const ACCENT = "#6d8cff";
const BORDER = "#23262c";

/** Share card: same mark as icon.svg, dark palette, no gradients. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: BG,
          color: TEXT,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 24 24">
            <circle cx="5" cy="7" r="1.5" fill={TEXT} opacity="0.55" />
            <circle cx="5" cy="12" r="1.5" fill={TEXT} opacity="0.75" />
            <circle cx="5" cy="17" r="1.5" fill={TEXT} opacity="0.95" />
            <path
              d="M7.5 7 C 12 7, 12 12, 15.5 12 M7.5 12 L15.5 12 M7.5 17 C 12 17, 12 12, 15.5 12"
              fill="none"
              stroke={TEXT}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path d="M15.5 12 H 19.5" stroke={ACCENT} strokeWidth="1.9" strokeLinecap="round" />
            <circle cx="19.5" cy="12" r="1.9" fill={ACCENT} />
          </svg>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: 4 }}>
            <span>ROUTE</span>
            <span style={{ color: ACCENT }}>DUST</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 600, lineHeight: 1.08, letterSpacing: -2, maxWidth: 980 }}>
            Gather testnet dust into the chain and asset you need.
          </div>
          <div style={{ display: "flex", fontSize: 30, color: MUTED, maxWidth: 940, lineHeight: 1.35 }}>
            Live quotes only, gas reserved on every chain, every transaction simulated before you sign.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: `1px solid ${BORDER}`,
            paddingTop: 28,
            fontSize: 24,
            color: MUTED,
            letterSpacing: 3,
          }}
        >
          <span>20 TESTNETS · 11 PROVIDERS</span>
          <span style={{ color: TEXT }}>routedust.xyz</span>
        </div>
      </div>
    ),
    size,
  );
}
