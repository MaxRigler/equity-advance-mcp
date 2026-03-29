export function validateBearerToken(request: Request): boolean {
  const token = process.env.MCP_BEARER_TOKEN;
  if (!token) {
    // If no token configured, reject all requests for safety
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  return match[1] === token;
}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
