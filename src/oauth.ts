import { randomUUID, randomBytes, createHash, createHmac } from "node:crypto";

// Since Vercel serverless functions are stateless (each invocation may land on a
// different instance), we can't rely on in-memory stores for auth codes.
//
// Strategy: encode the authorization state into the code itself as an HMAC-signed
// token. The MCP_BEARER_TOKEN is used as the HMAC key — it's the only shared
// secret available across all invocations.
//
// Code format: base64url(JSON({clientId, redirectUri, codeChallenge, exp})) + "." + hmac

// Client registration also can't persist in memory across invocations, so we
// accept any client_id in the authorize/token flow. The security boundary is
// the PKCE verification + the HMAC-signed code.

function getSigningKey(): string {
  const key = process.env.MCP_BEARER_TOKEN;
  if (!key) throw new Error("MCP_BEARER_TOKEN not configured");
  return key;
}

function sign(payload: string): string {
  return createHmac("sha256", getSigningKey())
    .update(payload)
    .digest("base64url");
}

interface CodePayload {
  cid: string; // client_id
  ruri: string; // redirect_uri
  cc: string; // code_challenge
  ccm: string; // code_challenge_method
  exp: number; // expiration timestamp (seconds)
}

const CODE_TTL_SECONDS = 300; // 5 minutes

export function createAuthorizationCode(
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  codeChallengeMethod: string,
): string {
  const payload: CodePayload = {
    cid: clientId,
    ruri: redirectUri,
    cc: codeChallenge,
    ccm: codeChallengeMethod,
    exp: Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS,
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function exchangeCode(
  code: string,
  clientId: string,
  codeVerifier?: string,
  redirectUri?: string,
): { valid: boolean; error?: string } {
  // Parse and verify the signed code
  const parts = code.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Invalid authorization code format" };
  }

  const [encoded, signature] = parts;
  const expectedSig = sign(encoded);
  if (signature !== expectedSig) {
    return { valid: false, error: "Invalid authorization code" };
  }

  let payload: CodePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
  } catch {
    return { valid: false, error: "Invalid authorization code" };
  }

  // Check expiration
  if (Math.floor(Date.now() / 1000) > payload.exp) {
    return { valid: false, error: "Authorization code expired" };
  }

  // Check client matches
  if (payload.cid !== clientId) {
    return { valid: false, error: "Client ID mismatch" };
  }

  // Check redirect_uri matches
  if (redirectUri && payload.ruri !== redirectUri) {
    return { valid: false, error: "Redirect URI mismatch" };
  }

  // Verify PKCE
  if (payload.ccm === "S256" && codeVerifier) {
    const expectedChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    if (expectedChallenge !== payload.cc) {
      return { valid: false, error: "PKCE verification failed" };
    }
  }

  return { valid: true };
}

// In-memory client store — used when the same serverless instance handles
// both /register and subsequent requests. If the instance is different,
// the authorize endpoint accepts any client_id anyway.
const clients = new Map<string, Record<string, any>>();

export function registerClient(metadata: Record<string, any>): Record<string, any> {
  const clientId = randomUUID();
  const clientSecret = randomBytes(32).toString("hex");

  const client = {
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0,
    redirect_uris: metadata.redirect_uris || [],
    client_name: metadata.client_name,
    token_endpoint_auth_method: metadata.token_endpoint_auth_method || "client_secret_post",
    grant_types: metadata.grant_types || ["authorization_code"],
    response_types: metadata.response_types || ["code"],
    scope: metadata.scope,
  };

  clients.set(clientId, client);
  return client;
}

export function getClient(clientId: string): Record<string, any> | undefined {
  return clients.get(clientId);
}

export function getOAuthMetadata(baseUrl: string) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    grant_types_supported: ["authorization_code", "refresh_token"],
  };
}

export function getProtectedResourceMetadata(baseUrl: string) {
  return {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
  };
}
