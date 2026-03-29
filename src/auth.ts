import type { IncomingMessage, ServerResponse } from "node:http";

export function validateBearerToken(req: IncomingMessage): boolean {
  const token = process.env.MCP_BEARER_TOKEN;
  if (!token) {
    return false;
  }

  const authHeader = req.headers["authorization"];
  if (!authHeader) return false;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  return match[1] === token;
}

export function sendUnauthorized(res: ServerResponse): void {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized" }));
}

export function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, mcp-session-id",
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
}
