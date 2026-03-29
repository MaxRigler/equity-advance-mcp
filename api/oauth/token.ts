import type { IncomingMessage, ServerResponse } from "node:http";
import { exchangeCode } from "../../src/oauth.js";

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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const bearerToken = process.env.MCP_BEARER_TOKEN;
  if (!bearerToken) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "server_error", error_description: "MCP_BEARER_TOKEN not configured" }));
    return;
  }

  try {
    const body = await readBody(req);
    const params = new URLSearchParams(body);

    const grantType = params.get("grant_type");
    const code = params.get("code");
    const clientId = params.get("client_id");
    const codeVerifier = params.get("code_verifier");
    const redirectUri = params.get("redirect_uri");

    if (grantType === "authorization_code") {
      if (!code || !clientId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_request", error_description: "Missing code or client_id" }));
        return;
      }

      const result = exchangeCode(code, clientId, codeVerifier ?? undefined, redirectUri ?? undefined);

      if (!result.valid) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_grant", error_description: result.error }));
        return;
      }

      // Return the MCP_BEARER_TOKEN as the access token
      const tokenResponse = {
        access_token: bearerToken,
        token_type: "bearer",
        expires_in: 3600 * 24 * 365, // 1 year
      };
      console.log("[token] issuing access_token starts with:", bearerToken.substring(0, 8));
      console.log("[token] issuing access_token length:", bearerToken.length);
      console.log("[token] full response:", JSON.stringify(tokenResponse));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tokenResponse));
      return;
    }

    if (grantType === "refresh_token") {
      // For simplicity, just return the same token
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          access_token: bearerToken,
          token_type: "bearer",
          expires_in: 3600 * 24 * 365,
        }),
      );
      return;
    }

    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unsupported_grant_type" }));
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "server_error", error_description: e.message }));
  }
}
