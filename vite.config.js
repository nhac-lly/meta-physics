import { optimizeGLTF } from "@iwsdk/vite-plugin-gltf-optimizer";
import { injectIWER } from "@iwsdk/vite-plugin-iwer";

import { compileUIKit } from "@iwsdk/vite-plugin-uikitml";
import { defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";

// Check if we're in CI/CD environment
const isCI = process.env.CI === "true" || process.env.CI === "1";

export default defineConfig(async () => {
  const plugins = [
    mkcert(),
    injectIWER({
      device: "metaQuest3",
      activation: "localhost",
      verbose: true,
    }),
  ];

  // Only include metaspatial plugins when not in CI/CD
  if (!isCI) {
    try {
      const { discoverComponents, generateGLXF } = await import(
        "@iwsdk/vite-plugin-metaspatial"
      );

      plugins.push(
        discoverComponents({
          outputDir: "metaspatial/components",
          include: /\.(js|ts|jsx|tsx)$/,
          exclude: /node_modules/,
          verbose: false,
        }),
        generateGLXF({
          metaSpatialDir: "metaspatial",
          outputDir: "public/glxf",
          verbose: false,
          enableWatcher: true,
        })
      );
    } catch (error) {
      console.warn("Metaspatial plugin not available, skipping:", error.message);
    }
  }

  plugins.push(
    compileUIKit({ sourceDir: "ui", outputDir: "public/ui", verbose: true }),
    optimizeGLTF({
      level: "medium",
    })
  );

  return {
    plugins,
    server: { host: "0.0.0.0", port: 8081, open: true },
    build: {
      outDir: "dist",
      sourcemap: process.env.NODE_ENV !== "production",
      target: "esnext",
      rollupOptions: { input: "./index.html" },
    },
    esbuild: { target: "esnext" },
    optimizeDeps: {
      exclude: ["@babylonjs/havok"],
      esbuildOptions: { target: "esnext" },
    },
    publicDir: "public",
    base: "./",
  };
});
