import { createApp } from "./app";

const port = Number.parseInt(process.env.API_PORT ?? process.env.PORT ?? "4000", 10);
const host = process.env.API_HOST ?? "0.0.0.0";

const app = createApp();

app.listen(port, host, () => {
  console.log(`API server listening on http://${host}:${port}`);
});
