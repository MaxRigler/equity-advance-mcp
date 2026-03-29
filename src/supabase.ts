import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
}

export interface TableSchema {
  table_name: string;
  columns: ColumnInfo[];
}

let supabase: SupabaseClient | null = null;
let schemaCache: Map<string, ColumnInfo[]> | null = null;
let schemaCacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

export async function getSchema(
  forceRefresh = false,
): Promise<Map<string, ColumnInfo[]>> {
  if (schemaCache && !forceRefresh && Date.now() - schemaCacheTime < CACHE_TTL_MS) {
    return schemaCache;
  }

  const client = getSupabase();
  const { data, error } = await client
    .from("information_schema.columns" as any)
    .select("table_name,column_name,data_type,is_nullable,column_default,ordinal_position")
    .eq("table_schema", "public")
    .order("ordinal_position", { ascending: true });

  if (error) {
    // Fallback: use raw SQL via rpc if information_schema isn't directly queryable
    const { data: rpcData, error: rpcError } = await client.rpc("execute_sql", {
      query: `
        SELECT table_name, column_name, data_type, is_nullable, column_default, ordinal_position
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `,
    });

    if (rpcError) {
      // Last resort: query pg_catalog
      return await getSchemaViaPgCatalog(client);
    }

    schemaCache = buildSchemaMap(rpcData as ColumnInfo[]);
    schemaCacheTime = Date.now();
    return schemaCache;
  }

  schemaCache = buildSchemaMap(data as unknown as ColumnInfo[]);
  schemaCacheTime = Date.now();
  return schemaCache;
}

async function getSchemaViaPgCatalog(
  client: SupabaseClient,
): Promise<Map<string, ColumnInfo[]>> {
  // Use Supabase's PostgREST to query the tables we can access
  // by attempting to list tables via the REST API
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch schema: ${response.statusText}`);
  }

  const openApiSpec = await response.json() as {
    definitions?: Record<string, { properties?: Record<string, { type?: string; format?: string; description?: string }> }>;
  };
  const map = new Map<string, ColumnInfo[]>();

  if (openApiSpec.definitions) {
    for (const [tableName, def] of Object.entries(openApiSpec.definitions)) {
      if (!def.properties) continue;
      const columns: ColumnInfo[] = Object.entries(def.properties).map(
        ([colName, colDef], idx) => ({
          column_name: colName,
          data_type: colDef.format || colDef.type || "unknown",
          is_nullable: colDef.description?.includes("not null") ? "NO" : "YES",
          column_default: null,
          ordinal_position: idx + 1,
        }),
      );
      map.set(tableName, columns);
    }
  }

  schemaCache = map;
  schemaCacheTime = Date.now();
  return map;
}

function buildSchemaMap(rows: ColumnInfo[]): Map<string, ColumnInfo[]> {
  const map = new Map<string, ColumnInfo[]>();
  for (const row of rows) {
    const tableName = (row as any).table_name;
    if (!map.has(tableName)) {
      map.set(tableName, []);
    }
    map.get(tableName)!.push(row);
  }
  return map;
}

export function clearSchemaCache(): void {
  schemaCache = null;
  schemaCacheTime = 0;
}
