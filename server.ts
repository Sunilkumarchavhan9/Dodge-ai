import "dotenv/config";

import { createServer } from "node:http";
import { parse } from "node:url";

import next from "next";

import { createApp as createApiApp } from "./backend/src/app";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? process.env.API_HOST ?? "0.0.0.0";
const dev = process.env.NODE_ENV === "development";

const nextApp = next({ dev, hostname: host, port });
const handle = nextApp.getRequestHandler();
const apiApp = createApiApp();

function isApiPath(pathname: string): boolean {
  return pathname === "/health" || pathname.startsWith("/api/");
}

async function main(): Promise<void> {
  await nextApp.prepare();

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    const pathname = parsedUrl.pathname ?? "/";

    if (isApiPath(pathname)) {
      apiApp(req as Parameters<typeof apiApp>[0], res as Parameters<typeof apiApp>[1]);
      return;
    }

    void handle(req, res, parsedUrl).catch((error) => {
      console.error("Failed to handle Next.js request", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });
  });

  server.listen(port, host, () => {
    console.log(`Unified server listening on http://${host}:${port}`);
  });
}

main().catch((error) => {
  console.error("Failed to start unified server", error);
  process.exit(1);
});
