import Fastify, { type FastifyInstance } from "fastify";
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

  return app;
}
