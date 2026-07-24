// ollamaService.js
//
// Natural-language -> SQL assistant backed by a local Ollama model.
// Supports SELECT / INSERT / UPDATE / DELETE and window functions,
// with guardrails since generated SQL can be executed directly.

const ALLOWED_STATEMENTS = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const FORBIDDEN_KEYWORDS = [
  "DROP", "ALTER", "TRUNCATE", "GRANT", "REVOKE",
  "CREATE", "RENAME", "REPLACE INTO", "--", "/*", "xp_cmdshell"
];

function buildSystemPrompt(schemaDescription) {
  return `You are a SQL generation assistant for a MySQL database.
The database currently has these tables:
${schemaDescription}

Rules:
- Respond with ONLY a single SQL statement that answers the question.
- The statement must be one of: SELECT, INSERT, UPDATE, DELETE.
- Use the exact table and column names shown above — do not invent columns.
- Join tables using matching foreign key / primary key columns when needed.
- For analytical questions (rankings, running totals, per-group comparisons,
  "top N per group", moving averages, etc.) prefer window functions such as
  ROW_NUMBER(), RANK(), DENSE_RANK(), SUM() OVER (...), AVG() OVER (...),
  and LAG()/LEAD() over subqueries where it makes the query clearer.
- DATE / DATETIME columns must never be compared directly to a bare year
  (e.g. WHERE hire_date > '2023' is INVALID and will error in MySQL).
  Instead:
    - "after <year>"      -> WHERE column > 'YYYY-12-31'
    - "before <year>"     -> WHERE column < 'YYYY-01-01'
    - "in <year>"         -> WHERE YEAR(column) = YYYY
                             (or column BETWEEN 'YYYY-01-01' AND 'YYYY-12-31')
    - "since <year>"      -> WHERE column >= 'YYYY-01-01'
    - "last N months/days"-> WHERE column >= (CURDATE() - INTERVAL N MONTH/DAY)
  Always use a full 'YYYY-MM-DD' literal or a YEAR()/date-function
  expression — never a plain 4-digit year string on its own.
- Every UPDATE and DELETE statement MUST include a WHERE clause. Never
  generate an UPDATE or DELETE without one.
- Do not add explanations, comments, or markdown code fences.
- Do not write DROP, ALTER, TRUNCATE, CREATE, GRANT, or REVOKE statements.
- Do not chain multiple statements with semicolons — output exactly one statement.
- If the question cannot be answered with these tables, respond with exactly: UNANSWERABLE`;
}

/**
 * Ask Ollama to translate a natural-language question into SQL.
 * Returns the raw SQL text (not yet validated).
 */
async function askOllama(question, schemaDescription) {
  const systemPrompt = buildSystemPrompt(schemaDescription);

  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3.1",
      system: systemPrompt,
      prompt: question,
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.response.trim();
}

/**
 * Validate generated SQL before anything is allowed to execute it.
 * Throws on anything unsafe. Returns { type, sql } on success.
 */
function validateSql(rawSql) {
  const sql = rawSql.trim().replace(/;+\s*$/, ""); // drop trailing semicolon(s)

  if (sql === "UNANSWERABLE") {
    return { type: "UNANSWERABLE", sql: null };
  }

  if (sql.includes(";")) {
    throw new Error("Multiple statements are not allowed.");
  }

  const upper = sql.toUpperCase();

  for (const kw of FORBIDDEN_KEYWORDS) {
    if (upper.includes(kw)) {
      throw new Error(`Forbidden keyword detected: ${kw}`);
    }
  }

  const type = ALLOWED_STATEMENTS.find((stmt) => upper.startsWith(stmt));
  if (!type) {
    throw new Error("Generated SQL is not a recognized SELECT/INSERT/UPDATE/DELETE statement.");
  }

  if ((type === "UPDATE" || type === "DELETE") && !/\bWHERE\b/i.test(sql)) {
    throw new Error(`${type} statement is missing a WHERE clause — refusing to execute.`);
  }

  return { type, sql };
}

/**
 * Ask a question, validate the SQL, and optionally execute it.
 *
 * @param {object} opts
 * @param {string} opts.question
 * @param {string} opts.schemaDescription
 * @param {import('mysql2/promise').Pool} opts.pool - a mysql2 connection pool
 * @param {boolean} [opts.dryRun=true] - for INSERT/UPDATE/DELETE, if true,
 *        returns the SQL without executing it so a caller can show it to
 *        the user for confirmation first.
 * @param {number} [opts.tenantId] - optional school_id to sanity-check
 *        write queries touch the caller's own tenant when the table has
 *        a school_id column referenced in the WHERE clause.
 */
async function runNlQuery({ question, schemaDescription, pool, dryRun = true, tenantId }) {
  const raw = await askOllama(question, schemaDescription);
  const { type, sql } = validateSql(raw);

  if (type === "UNANSWERABLE") {
    return { status: "unanswerable" };
  }

  if (type !== "SELECT" && dryRun) {
    return { status: "pending_confirmation", type, sql };
  }

  if (type !== "SELECT" && tenantId != null && /school_id/i.test(sql) && !sql.includes(String(tenantId))) {
    // Cheap sanity check, not a substitute for real row-level security.
    throw new Error("Generated write query does not appear scoped to the caller's school_id.");
  }

  const connection = await pool.getConnection();
  try {
    if (type === "SELECT") {
      const [rows] = await connection.query(sql);
      return { status: "ok", type, sql, rows };
    }

    await connection.beginTransaction();
    const [result] = await connection.query(sql);
    await connection.commit();
    return {
      status: "ok",
      type,
      sql,
      affectedRows: result.affectedRows,
      insertId: result.insertId,
    };
  } catch (err) {
    if (type !== "SELECT") {
      try { await connection.rollback(); } catch (_) { /* ignore */ }
    }
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { askOllama, validateSql, runNlQuery };