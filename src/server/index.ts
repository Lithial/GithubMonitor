import Fastify, { type FastifyInstance } from "fastify";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => ({ ok: true, tokenPresent: false }));

  return app;
}
