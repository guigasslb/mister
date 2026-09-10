import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // React 19 usa o runtime JSX automático; alinhar o esbuild do vitest para que
  // os testes possam renderizar componentes (ex.: fundos de campo — §11.5).
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only` lança ao ser importado fora do runtime RSC (a sua proteção
      // de build). Em testes (Node) apontamos para o módulo vazio que o próprio
      // pacote serve no servidor — reflete o comportamento real (no-op) e permite
      // testar módulos que dependem, transitivamente, de clientes server-only
      // (ex.: `lib/supabase-storage.ts`).
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
});
