import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { buildItems } from "./items";
import { resolveToken } from "./github";
import { setSnooze } from "./snooze";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => ({
    ok: true,
    tokenPresent: resolveToken() != null,
  }));
  app.get("/api/items", async () => buildItems());
  app.post("/api/snooze", async (req, reply) => {
    const { key, until } = req.body as { key: string; until: string | null };
    setSnooze(key, until ?? null);
    reply.code(204);
    return null;
  });

  if (process.env.NODE_ENV === "production") {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dist");
    if (existsSync(root)) {
      app.register(fastifyStatic, { root });
      app.setNotFoundHandler((_req, reply) => reply.sendFile("index.html"));
    }
  }

  return app;
}
