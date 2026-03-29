import type { IncomingMessage, ServerResponse } from "node:http";

export function validateBearerToken(req: IncomingMessage): boolean {
  const token = process.env.MCP_BEARER_TOKEN;
  const authHeader = req.headers["authorization"];

  // Debug logging — visible in Vercel function logs
  console.log("[auth] method:", req.method);
  console.log("[auth] url:", req.url);
  console.log("[auth] authorization header present:", !!authHeader);
  console.log("[auth] authorization header value:", authHeader ? `${authHeader.substring(0, 20)}...` : "(none)");
  console.log("[auth] MCP_BEARER_TOKEN configured:", !!token);
  console.log("[auth] MCP_BEARER_TOKEN starts with:", token ? token.substring(0, 8) : "(none)");

  if (!token) {
    console.log("[auth] REJECT: no MCP_BEARER_TOKEN configured");
    return false;
  }

  if (!authHeader) {
    console.log("[auth] REJECT: no authorization header");
    console.log("[auth] all headers:", JSON.stringify(Object.keys(req.headers)));
    return false;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    console.log("[auth] REJECT: authorization header doesn't match Bearer pattern");
    console.log("[auth] full header:", authHeader);
    return false;
  }

  const receivedToken = match[1].trim();
  const matches = receivedToken === token;
  console.log("[auth] received token starts with:", receivedToken.substring(0, 8));
  console.log("[auth] expected token starts with:", token.substring(0, 8));
  console.log("[auth] token length received:", receivedToken.length, "expected:", token.length);
  console.log("[auth] tokens match:", matches);

  if (!matches) {
    console.log("[auth] REJECT: token mismatch");
  }

  return matches;
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
