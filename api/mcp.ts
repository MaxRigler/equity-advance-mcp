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

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Auth check
  if (!validateBearerToken(req)) {
    sendUnauthorized(res);
    return;
  }

  // Only POST, GET (for SSE), and DELETE are valid MCP methods
  if (!["GET", "POST", "DELETE"].includes(req.method ?? "")) {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method not allowed");
    return;
  }

  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless for serverless
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (e: any) {
    console.error("MCP handler error:", e);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(
      JSON.stringify({ error: "Internal server error", message: e.message }),
    );
  }
}
