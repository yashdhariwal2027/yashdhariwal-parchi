import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

/*
 * Lets `npm run dev` serve /api/parse locally (on Vercel it runs as a serverless function).
 * The key is read from .env.local on your computer and stays on the server side of Vite.
 */
function localApi(): Plugin {
  return {
    name: "parchi-local-api",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      server.middlewares.use("/api/parse", async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const mod = await server.ssrLoadModule("/api/parse.ts");
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
          const request = new Request(`http://localhost/api/parse`, {
            method: req.method,
            headers,
            body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
          });
          const response: Response = await mod.handleParse(request, env);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: "ai_failed", message: "Local API error. See the terminal." }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
