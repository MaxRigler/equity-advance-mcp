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
    const server = createMcpServer();

    // enableJsonResponse: true makes POST responses return as JSON instead of
    // opening a long-lived SSE stream. This is critical for Vercel serverless
    // where functions must complete within the timeout — SSE streams hang forever.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless for serverless
      enableJsonResponse: true,
    });

    transport.onerror = (err: Error) => {
      console.error(`[mcp] transport error t=${Date.now() - t0}ms:`, err.message);
    };

    await server.connect(transport);
    console.log(`[mcp] server connected t=${Date.now() - t0}ms`);

    // Intercept writeHead to log status
    const origWriteHead = res.writeHead.bind(res);
    (res as any).writeHead = (statusCode: number, ...args: any[]) => {
      console.log(`[mcp] response status: ${statusCode} t=${Date.now() - t0}ms`);
      return origWriteHead(statusCode, ...args);
    };

    await transport.handleRequest(req, res);
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
