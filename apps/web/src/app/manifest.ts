import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RouteDust — testnet router",
    short_name: "RouteDust",
    description: "Route fragmented testnet balances into the exact chain and asset you want, through live quotes only.",
    start_url: "/",
    display: "standalone",
    theme_color: "#0b0c0e",
    background_color: "#0b0c0e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
