import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd()),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    env: {
      SESSION_SECRET:
        "test-secret-com-mais-de-32-caracteres-para-os-testes-do-verde",
      TZ: "America/Sao_Paulo",
    },
  },
});
