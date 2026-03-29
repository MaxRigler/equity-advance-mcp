import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "../src/server.js";
import {
  validateBearerToken,
  sendUnauthorized,
  setCorsHeaders,
} from "../src/auth.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  setCorsHeaders(res);

  const t0 = Date.now();
  console.log(`[mcp] === request === ${req.method} ${req.url} t=0ms`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Auth check
  if (!validateBearerToken(req)) {
    console.log("[mcp] auth FAILED, returning 401");
    sendUnauthorized(res);
    return;
  }
  console.log(`[mcp] auth passed t=${Date.now() - t0}ms`);

  // Only POST, GET, and DELETE are valid MCP Streamable HTTP methods
  if (!["GET", "POST", "DELETE"].includes(req.method ?? "")) {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method not allowed");
    return;
  }

  try {
    // Pre-read the body for POST requests so getRequestListener doesn't hang
    // waiting on a body that Vercel may have already consumed.
    let parsedBody: unknown | undefined;
    if (req.method === "POST") {
      const raw = await readBody(req);
      console.log(`[mcp] body read (${raw.length} bytes) t=${Date.now() - t0}ms`);
      try {
        parsedBody = JSON.parse(raw);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
        return;
      }
    }

    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    transport.onerror = (err: Error) => {
      console.error(`[mcp] transport error t=${Date.now() - t0}ms:`, err.message);
    };

    await server.connect(transport);
    console.log(`[mcp] server connected t=${Date.now() - t0}ms`);

    await transport.handleRequest(req, res, parsedBody);
    console.log(`[mcp] handleRequest done t=${Date.now() - t0}ms`);
  } catch (e: any) {
    console.error(`[mcp] ERROR t=${Date.now() - t0}ms:`, e.message, e.stack);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(
      JSON.stringify({ error: "Internal server error", message: e.message }),
    );
  }
  console.log(`[mcp] function completing t=${Date.now() - t0}ms`);
}
