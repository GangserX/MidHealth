import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { viteCommonjs } from "@originjs/vite-plugin-commonjs";

// https://vitejs.dev/config/
// Ref: https://github.com/midnightntwrk/example-bboard/blob/main/bboard-ui/vite.config.ts
export default defineConfig(({ mode }) => ({
  plugins: [
    nodePolyfills({
      include: ["buffer", "process"],
      globals: { Buffer: true, process: true },
    }),
    wasm(),
    react(),
    viteCommonjs(),
    topLevelAwait({
      promiseExportName: "__tla",
      promiseImportName: (i: number) => `__tla_${i}`,
    }),
  ],
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      mode === "production" ? "production" : "development"
    ),
    "process.env": {},
    global: "globalThis",
  },
  server: {
    port: 5173,
    // Proxy API calls to the optional backend
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
    fs: {
      // Allow serving files from one level up (for contract managed/ artifacts)
      allow: [".."],
    },
  },
  build: {
    target: "esnext",
    commonjsOptions: {
      transformMixedEsModules: true,
      extensions: [".js", ".cjs"],
      ignoreDynamicRequires: true,
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
      supported: { "top-level-await": true },
      platform: "browser",
      format: "esm",
      define: { global: "globalThis" },
    },
    include: ["@midnight-ntwrk/compact-runtime"],
    exclude: ["@midnight-ntwrk/onchain-runtime-v2"],
  },
  resolve: {
    extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json", ".wasm"],
    mainFields: ["browser", "module", "main"],
  },
}));
