// Alias for /mcp — some MCP clients try /sse
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "../src/server.js";
import { validateBearerToken, unauthorizedResponse } from "../src/auth.js";

export const config = {
  runtime: "edge",
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (!validateBearerToken(request)) {
    return unauthorizedResponse();
  }

  if (!["GET", "POST", "DELETE"].includes(request.method)) {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const server = createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);

    const response = await transport.handleRequest(request);

    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders())) {
      headers.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: "Internal server error", message: e.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } },
    );
  }
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id",
    "Access-Control-Expose-Headers": "mcp-session-id",
  };
}
