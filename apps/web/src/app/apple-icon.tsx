import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BG = "#0b0c0e";
const TEXT = "#f2f1ec";
const ACCENT = "#6d8cff";

/** Home-screen icon: the icon.svg mark on a full-bleed square (iOS rounds the corners itself), flat. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BG }}>
        <svg width="156" height="156" viewBox="0 0 24 24">
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
      </div>
    ),
    size,
  );
}
