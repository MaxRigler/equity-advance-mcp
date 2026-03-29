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

  console.log("[mcp] === incoming request ===");
  console.log("[mcp] method:", req.method);
  console.log("[mcp] url:", req.url);
  console.log("[mcp] headers:", JSON.stringify(req.headers, null, 2));

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
  console.log("[mcp] auth PASSED");

  // Only POST, GET (for SSE), and DELETE are valid MCP methods
  if (!["GET", "POST", "DELETE"].includes(req.method ?? "")) {
    console.log("[mcp] method not allowed:", req.method);
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method not allowed");
    return;
  }

  try {
    console.log("[mcp] creating MCP server and transport...");
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless for serverless
    });

    // Log transport errors
    transport.onerror = (err: Error) => {
      console.error("[mcp] transport error:", err.message, err.stack);
    };

    await server.connect(transport);
    console.log("[mcp] server connected to transport, handling request...");

    // Intercept the response to log the status code
    const origWriteHead = res.writeHead.bind(res);
    (res as any).writeHead = (statusCode: number, ...args: any[]) => {
      console.log("[mcp] response status:", statusCode);
      return origWriteHead(statusCode, ...args);
    };

    await transport.handleRequest(req, res);
    console.log("[mcp] handleRequest completed");
  } catch (e: any) {
    console.error("[mcp] HANDLER ERROR:", e.message);
    console.error("[mcp] stack:", e.stack);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(
      JSON.stringify({ error: "Internal server error", message: e.message }),
    );
  }
}
