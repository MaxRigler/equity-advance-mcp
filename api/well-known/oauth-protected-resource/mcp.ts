import type { IncomingMessage, ServerResponse } from "node:http";
import { getProtectedResourceMetadata } from "../../../src/oauth.js";

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  const baseUrl = `${proto}://${host}`;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(getProtectedResourceMetadata(baseUrl)));
}
