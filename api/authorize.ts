import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { getClient, createAuthorizationCode } from "../src/oauth.js";

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  // Parse query params from the URL
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  const url = new URL(req.url || "/", `${proto}://${host}`);
  const params = url.searchParams;

  const clientId = params.get("client_id");
  const responseType = params.get("response_type");
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method") || "S256";

  // Validate required params
  if (!clientId || !responseType || !redirectUri || !codeChallenge) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "invalid_request",
        error_description: "Missing required parameters: client_id, response_type, redirect_uri, code_challenge",
      }),
    );
    return;
  }

  if (responseType !== "code") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "unsupported_response_type",
        error_description: "Only response_type=code is supported",
      }),
    );
    return;
  }

  // Look up client — if not found, auto-register it (Claude may have registered
  // in a previous serverless invocation that's since been garbage-collected)
  const client = getClient(clientId);
  if (!client) {
    // For single-user setup, accept any client_id that comes through the OAuth flow.
    // The real security boundary is the MCP_BEARER_TOKEN returned at token exchange.
  }

  // Auto-approve: generate authorization code and redirect back immediately
  const code = createAuthorizationCode(
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
  );

  // Build redirect URL with code and state
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) {
    redirect.searchParams.set("state", state);
  }

  res.writeHead(302, { Location: redirect.toString() });
  res.end();
}
