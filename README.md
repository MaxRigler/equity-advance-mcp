# equity-advance-mcp

A remote MCP (Model Context Protocol) server that connects to your Supabase database and exposes read-only access to all tables. Deploy on Vercel and add as a custom connector in Claude.ai to query your CRM data from any Claude chat.

## Architecture

- **Runtime**: Vercel Edge Functions
- **Protocol**: MCP over Streamable HTTP (SSE)
- **Database**: Supabase (PostgREST + service role key)
- **Auth**: Bearer token on every request

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_tables` | List all tables with column names and types |
| `describe_table` | Detailed column info for a specific table |
| `query_table` | Query rows with filters, ordering, and limits |
| `count_rows` | Count rows with optional filters |
| `run_sql` | Execute raw SELECT queries (read-only enforced) |
| `refresh_schema` | Clear and re-fetch the schema cache |

## Setup

### 1. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### 2. Set Environment Variables in Vercel

Go to your Vercel project settings > Environment Variables and add:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Your Supabase project URL (e.g., `https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key (from Settings > API) |
| `MCP_BEARER_TOKEN` | A secret token you generate (e.g., `openssl rand -hex 32`) |

### 3. Create the SQL Helper Function (Optional)

For the `run_sql` tool to work, create this function in your Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION execute_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  EXECUTE format('SELECT json_agg(row_to_json(t)) FROM (%s) t', query) INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$$;
```

### 4. Add as Custom Connector in Claude.ai

1. Go to [claude.ai](https://claude.ai) > Settings > Integrations
2. Click "Add custom integration" (or "Add MCP server")
3. Enter your server URL: `https://your-project.vercel.app/mcp`
4. Set the authentication type to **Bearer Token**
5. Enter the same `MCP_BEARER_TOKEN` value you set in Vercel
6. Save and test

## Example Queries

Once connected, you can ask Claude things like:

- "What tables are in my database?"
- "Show me the last 10 records from the contacts table"
- "How many deals have a status of 'closed-won'?"
- "Show me all contacts created this month, ordered by company"
- "Run a SQL query to get total deal value grouped by status"
- "What columns does the opportunities table have?"

## Endpoints

| Path | Description |
|------|-------------|
| `/mcp` | MCP server endpoint (Streamable HTTP) |
| `/sse` | Alias for `/mcp` |
| `/health` | Health check (returns 200) |

## Security

- All requests require a valid bearer token
- The `run_sql` tool only allows SELECT/WITH/EXPLAIN statements
- Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are rejected
- The Supabase service role key is never exposed in responses

## Development

```bash
npm install
npm run build
```
