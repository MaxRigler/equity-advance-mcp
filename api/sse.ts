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

  console.log("[sse] === incoming request ===");
  console.log("[sse] method:", req.method);
  console.log("[sse] url:", req.url);
  console.log("[sse] headers:", JSON.stringify(req.headers, null, 2));

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
  console.log("[sse] auth PASSED");

  if (!["GET", "POST", "DELETE"].includes(req.method ?? "")) {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method not allowed");
    return;
  }

  try {
    console.log("[sse] creating MCP server and transport...");
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    transport.onerror = (err: Error) => {
      console.error("[sse] transport error:", err.message, err.stack);
    };

    await server.connect(transport);
    console.log("[sse] server connected, handling request...");

    const origWriteHead = res.writeHead.bind(res);
    (res as any).writeHead = (statusCode: number, ...args: any[]) => {
      console.log("[sse] response status:", statusCode);
      return origWriteHead(statusCode, ...args);
    };

    await transport.handleRequest(req, res);
    console.log("[sse] handleRequest completed");
  } catch (e: any) {
    console.error("[sse] HANDLER ERROR:", e.message);
    console.error("[sse] stack:", e.stack);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(
      JSON.stringify({ error: "Internal server error", message: e.message }),
    );
  }
}
