import { buildServer } from "./index";

const app = buildServer();
const port = Number(process.env.PORT ?? 8787);
app
  .listen({ port, host: "127.0.0.1" })
  .then(() => console.log(`github-monitor on http://127.0.0.1:${port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
