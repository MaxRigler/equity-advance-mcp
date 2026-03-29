// Alias for /mcp — some MCP clients try /sse
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "../src/server.js";
import {
  validateBearerToken,
  sendUnauthorized,
  setCorsHeaders,
} from "../src/auth.js";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  setCorsHeaders(res);

  const t0 = Date.now();
  console.log(`[sse] === request === ${req.method} ${req.url} t=0ms`);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!validateBearerToken(req)) {
    console.log("[sse] auth FAILED, returning 401");
    sendUnauthorized(res);
    return;
  }
  console.log(`[sse] auth passed t=${Date.now() - t0}ms`);

  if (!["GET", "POST", "DELETE"].includes(req.method ?? "")) {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method not allowed");
    return;
  }

  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    transport.onerror = (err: Error) => {
      console.error(`[sse] transport error t=${Date.now() - t0}ms:`, err.message);
    };

    await server.connect(transport);
    console.log(`[sse] server connected t=${Date.now() - t0}ms`);

    await transport.handleRequest(req, res);
    console.log(`[sse] handleRequest done t=${Date.now() - t0}ms`);
  } catch (e: any) {
    console.error(`[sse] ERROR t=${Date.now() - t0}ms:`, e.message, e.stack);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(
      JSON.stringify({ error: "Internal server error", message: e.message }),
    );
  }
  console.log(`[sse] function completing t=${Date.now() - t0}ms`);
}
