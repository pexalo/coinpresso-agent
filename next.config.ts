import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The pipeline routes call external model APIs and can run for a while.
  // Keep them on the Node runtime rather than Edge.
  serverExternalPackages: [],
};

export default nextConfig;
