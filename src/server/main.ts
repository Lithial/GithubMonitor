import { buildServer } from "./index";

const app = buildServer();
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
app
  .listen({ port, host })
  .then(() => console.log(`github-monitor on http://${host}:${port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
