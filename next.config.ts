import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pglite 仅用于本地开发的内嵌 Postgres，不打进服务端 bundle
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
