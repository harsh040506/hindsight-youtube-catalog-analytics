import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hindsight", short_name: "Hindsight", start_url: "/dashboard", display: "standalone",
    background_color: "#faf9f5", theme_color: "#faf9f5",
    description: "Find out which upload choices actually move your YouTube numbers.",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
