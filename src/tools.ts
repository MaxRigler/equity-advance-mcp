import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSupabase, getSchema, clearSchemaCache } from "./supabase.js";
import { isReadOnlySQL } from "./sql-validator.js";

type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "is";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function jsonResult(data: unknown) {
  return textResult(JSON.stringify(data, null, 2));
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

export function registerTools(server: McpServer) {
  // 1. list_tables
  server.registerTool("list_tables", {
    title: "List Tables",
    description:
      "Returns all tables in the database with their column names and types. Use this to understand the schema before querying.",
    inputSchema: {},
  }, async () => {
    try {
      const schema = await getSchema();
      const tables = Array.from(schema.entries()).map(([name, columns]) => ({
        table: name,
        columns: columns.map((c) => ({
          name: c.column_name,
          type: c.data_type,
        })),
      }));
      return jsonResult(tables);
    } catch (e: any) {
      return errorResult(e.message);
    }
  });

  // 2. describe_table
  server.registerTool("describe_table", {
    title: "Describe Table",
    description:
      "Returns detailed column info (names, types, nullable, defaults) for a specific table.",
    inputSchema: {
      table: z.string().describe("The table name to describe"),
    },
  }, async ({ table }) => {
    try {
      const schema = await getSchema();
      const columns = schema.get(table);
      if (!columns) {
        const available = Array.from(schema.keys()).join(", ");
        return errorResult(
          `Table "${table}" not found. Available tables: ${available}`,
        );
      }
      return jsonResult(
        columns.map((c) => ({
          name: c.column_name,
          type: c.data_type,
          nullable: c.is_nullable === "YES",
          default: c.column_default,
          position: c.ordinal_position,
        })),
      );
    } catch (e: any) {
      return errorResult(e.message);
    }
  });

  // 3. query_table
  server.registerTool("query_table", {
    title: "Query Table",
    description:
      "Query rows from a table with optional filters, ordering, and limit. Returns matching rows as JSON.",
    inputSchema: {
      table: z.string().describe("The table name to query"),
      select: z
        .string()
        .optional()
        .default("*")
        .describe('Comma-separated column names or "*" for all'),
      filters: z
        .array(
          z.object({
            column: z.string(),
            operator: z.enum([
              "eq",
              "neq",
              "gt",
              "gte",
              "lt",
              "lte",
              "like",
              "ilike",
              "is",
            ]),
            value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
          }),
        )
        .optional()
        .describe("Array of filter conditions"),
      order_by: z.string().optional().describe("Column name to order by"),
      order_direction: z
        .enum(["asc", "desc"])
        .optional()
        .default("desc")
        .describe("Sort direction"),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Max rows to return (capped at 200)"),
    },
  }, async ({ table, select, filters, order_by, order_direction, limit }) => {
    try {
      const client = getSupabase();
      const cappedLimit = Math.min(limit ?? 50, 200);

      let query = client.from(table).select(select ?? "*");

      if (filters) {
        for (const f of filters) {
          const op = f.operator as FilterOperator;
          query = query.filter(f.column, op, f.value);
        }
      }

      if (order_by) {
        query = query.order(order_by, {
          ascending: (order_direction ?? "desc") === "asc",
        });
      }

      query = query.limit(cappedLimit);

      const { data, error } = await query;
      if (error) return errorResult(error.message);
      return jsonResult({ row_count: data?.length ?? 0, rows: data });
    } catch (e: any) {
      return errorResult(e.message);
    }
  });

  // 4. count_rows
  server.registerTool("count_rows", {
    title: "Count Rows",
    description:
      "Returns the count of rows in a table, optionally filtered.",
    inputSchema: {
      table: z.string().describe("The table name"),
      filters: z
        .array(
          z.object({
            column: z.string(),
            operator: z.enum([
              "eq",
              "neq",
              "gt",
              "gte",
              "lt",
              "lte",
              "like",
              "ilike",
              "is",
            ]),
            value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
          }),
        )
        .optional()
        .describe("Array of filter conditions"),
    },
  }, async ({ table, filters }) => {
    try {
      const client = getSupabase();
      let query = client
        .from(table)
        .select("*", { count: "exact", head: true });

      if (filters) {
        for (const f of filters) {
          query = query.filter(f.column, f.operator as FilterOperator, f.value);
        }
      }

      const { count, error } = await query;
      if (error) return errorResult(error.message);
      return jsonResult({ table, count });
    } catch (e: any) {
      return errorResult(e.message);
    }
  });

  // 5. run_sql
  server.registerTool("run_sql", {
    title: "Run SQL (Read-Only)",
    description:
      "Execute a raw SQL SELECT query. Only SELECT/WITH/EXPLAIN statements are allowed — all write operations are rejected. Use this for complex queries with JOINs, GROUP BY, subqueries, etc.",
    inputSchema: {
      sql: z.string().describe("A SQL SELECT query to execute"),
    },
  }, async ({ sql }) => {
    try {
      const validation = isReadOnlySQL(sql);
      if (!validation.valid) {
        return errorResult(validation.reason!);
      }

      const client = getSupabase();

      // Execute via Supabase's PostgREST RPC or direct SQL
      // Use the rpc approach with a helper function, or fetch directly
      const response = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/rpc/execute_sql`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ query: sql }),
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        // If the RPC function doesn't exist, try the /sql endpoint
        if (response.status === 404 || errText.includes("execute_sql")) {
          return await runSqlViaPostgrest(sql);
        }
        return errorResult(`SQL execution failed: ${errText}`);
      }

      const data = await response.json();
      return jsonResult({ row_count: Array.isArray(data) ? data.length : null, rows: data });
    } catch (e: any) {
      return errorResult(e.message);
    }
  });

  // 6. refresh_schema (bonus utility tool)
  server.registerTool("refresh_schema", {
    title: "Refresh Schema Cache",
    description: "Clears the cached schema and re-fetches table metadata from the database.",
    inputSchema: {},
  }, async () => {
    try {
      clearSchemaCache();
      const schema = await getSchema(true);
      return textResult(
        `Schema cache refreshed. Found ${schema.size} tables: ${Array.from(schema.keys()).join(", ")}`,
      );
    } catch (e: any) {
      return errorResult(e.message);
    }
  });
}

async function runSqlViaPostgrest(sql: string) {
  // Use Supabase's pg_net or direct SQL endpoint if available
  const response = await fetch(`${process.env.SUPABASE_URL}/pg`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: Raw SQL execution requires a database function. Please create this function in your Supabase SQL Editor:\n\nCREATE OR REPLACE FUNCTION execute_sql(query text)\nRETURNS json\nLANGUAGE plpgsql\nSECURITY DEFINER\nAS $$\nDECLARE\n  result json;\nBEGIN\n  EXECUTE query INTO result;\n  RETURN result;\nEND;\n$$;\n\nOr use the query_table tool for simple queries.`,
        },
      ],
      isError: true,
    };
  }

  const data = await response.json();
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ rows: data }, null, 2) }],
  };
}
