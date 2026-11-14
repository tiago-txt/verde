import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Acesso ao dev server pela rede local/Docker (ex.: 192.168.240.1).
  allowedDevOrigins: ["192.168.240.1"],
  // better-sqlite3 é um módulo nativo: não deve ser empacotado pelo bundler.
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
