import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@testnet-router/core", "@testnet-router/registry", "@testnet-router/providers"],
};

export default nextConfig;
