import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // The official adapter preserves the deployment output and preview integration.
  tanstackStart: { server: { entry: "server" } },
});
