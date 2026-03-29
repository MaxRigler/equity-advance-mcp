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

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!validateBearerToken(req)) {
    sendUnauthorized(res);
    return;
  }

  if (!["GET", "POST", "DELETE"].includes(req.method ?? "")) {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method not allowed");
    return;
  }

  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
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
