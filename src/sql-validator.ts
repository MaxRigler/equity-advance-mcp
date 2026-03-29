const WRITE_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "MERGE",
  "UPSERT",
  "REPLACE",
  "EXEC",
  "EXECUTE",
  "CALL",
  "SET ",
  "COPY",
  "VACUUM",
  "REINDEX",
  "CLUSTER",
  "COMMENT",
  "LOCK",
  "NOTIFY",
  "LISTEN",
  "UNLISTEN",
  "LOAD",
  "RESET",
  "DISCARD",
  "REASSIGN",
  "SECURITY",
  "DO ",
];

export function isReadOnlySQL(sql: string): { valid: boolean; reason?: string } {
  // Remove comments
  const cleaned = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();

  if (!cleaned) {
    return { valid: false, reason: "Empty SQL statement" };
  }

  // Must start with SELECT, WITH, or EXPLAIN
  const firstWord = cleaned.split(/\s+/)[0].toUpperCase();
  if (!["SELECT", "WITH", "EXPLAIN"].includes(firstWord)) {
    return {
      valid: false,
      reason: `SQL must start with SELECT, WITH, or EXPLAIN. Got: ${firstWord}`,
    };
  }

  // Check for write keywords anywhere in the statement
  const upperCleaned = cleaned.toUpperCase();
  for (const keyword of WRITE_KEYWORDS) {
    // Use word boundary check to avoid false positives
    const pattern = new RegExp(`\\b${keyword.trim()}\\b`, "i");
    if (pattern.test(upperCleaned)) {
      // Allow these keywords inside string literals or subqueries for SELECT
      // But reject if they appear as a statement-level command
      // Simple heuristic: check if it appears before the first FROM or after a semicolon
      const semicolonParts = upperCleaned.split(";").filter((p) => p.trim());
      for (const part of semicolonParts) {
        const partFirstWord = part.trim().split(/\s+/)[0];
        if (WRITE_KEYWORDS.some((kw) => partFirstWord === kw.trim())) {
          return {
            valid: false,
            reason: `Write operation detected: ${keyword.trim()}. Only SELECT queries are allowed.`,
          };
        }
      }
    }
  }

  // Reject multiple statements (semicolons followed by more SQL)
  const statements = cleaned.split(";").filter((s) => s.trim());
  if (statements.length > 1) {
    return {
      valid: false,
      reason: "Multiple SQL statements are not allowed. Send one SELECT at a time.",
    };
  }

  return { valid: true };
}
