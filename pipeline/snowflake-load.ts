// Loads the reviewed civic research corpus (pipeline/research/miami-beach-civic-corpus.json) into
// Snowflake: COASTAL_CLASH.CORPUS.ISSUES, .SOURCES and the APPROVED_ISSUES view the game reads.
// Re-running is safe: issues are merged by id and a human's review_status is never overwritten.
//
//   npx tsx --env-file=.env pipeline/snowflake-load.ts          # push through the SQL API
//   npx tsx pipeline/snowflake-load.ts --sql                     # write pipeline/research/load.sql to paste into a worksheet
//
// .env: SNOWFLAKE_ACCOUNT (e.g. erfrxht-wd26168), SNOWFLAKE_TOKEN (a programmatic access token),
//       optional SNOWFLAKE_WAREHOUSE (default COMPUTE_WH), SNOWFLAKE_ROLE.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(HERE, 'research', 'miami-beach-civic-corpus.json'), 'utf8'));
const items = JSON.stringify(corpus.items);

const DB = 'COASTAL_CLASH';
const SCHEMA = 'CORPUS';

/** The load, as single statements. `?` is the corpus JSON (bound, or inlined for the worksheet). */
const statements = (json: string) => [
  `CREATE DATABASE IF NOT EXISTS ${DB}`,
  `CREATE SCHEMA IF NOT EXISTS ${DB}.${SCHEMA}`,
  `CREATE TABLE IF NOT EXISTS ${DB}.${SCHEMA}.ISSUES (
    ID STRING PRIMARY KEY, TITLE STRING, AREA STRING, SCOPE STRING, CATEGORY STRING, YEARS STRING, SUMMARY STRING,
    FACTS VARIANT, SIDES VARIANT, TENSIONS ARRAY, CONCERNS ARRAY, CARD_IDEAS ARRAY, VERIFICATION VARIANT,
    REVIEW_STATUS STRING DEFAULT 'unreviewed', RETRIEVED_AT DATE, LOADED_AT TIMESTAMP_LTZ)`,
  `ALTER TABLE ${DB}.${SCHEMA}.ISSUES DROP COLUMN IF EXISTS "CAST"`,
  `ALTER TABLE ${DB}.${SCHEMA}.ISSUES ADD COLUMN IF NOT EXISTS STORY_CAST VARIANT`,
  `CREATE TABLE IF NOT EXISTS ${DB}.${SCHEMA}.SOURCES (ISSUE_ID STRING, TITLE STRING, OUTLET STRING, URL STRING, KIND STRING)`,
  `MERGE INTO ${DB}.${SCHEMA}.ISSUES t
   USING (SELECT f.value AS v FROM TABLE(FLATTEN(INPUT => PARSE_JSON(${json})) ) f) s
   ON t.ID = s.v:id::STRING
   WHEN MATCHED THEN UPDATE SET
     TITLE = s.v:title::STRING, AREA = s.v:area::STRING, SCOPE = s.v:scope::STRING, CATEGORY = s.v:category::STRING,
     YEARS = s.v:years::STRING, SUMMARY = s.v:summary::STRING, FACTS = s.v:facts, SIDES = s.v:sides,
     TENSIONS = s.v:tensions::ARRAY, CONCERNS = s.v:concerns::ARRAY, CARD_IDEAS = s.v:card_ideas::ARRAY,
     VERIFICATION = s.v:verification, STORY_CAST = s.v:cast, RETRIEVED_AT = s.v:retrieved_at::DATE, LOADED_AT = CURRENT_TIMESTAMP()
   WHEN NOT MATCHED THEN INSERT (ID, TITLE, AREA, SCOPE, CATEGORY, YEARS, SUMMARY, FACTS, SIDES, TENSIONS, CONCERNS, CARD_IDEAS, VERIFICATION, STORY_CAST, REVIEW_STATUS, RETRIEVED_AT, LOADED_AT)
   VALUES (s.v:id::STRING, s.v:title::STRING, s.v:area::STRING, s.v:scope::STRING, s.v:category::STRING, s.v:years::STRING,
     s.v:summary::STRING, s.v:facts, s.v:sides, s.v:tensions::ARRAY, s.v:concerns::ARRAY, s.v:card_ideas::ARRAY,
     s.v:verification, s.v:cast, s.v:review_status::STRING, s.v:retrieved_at::DATE, CURRENT_TIMESTAMP())`,
  `DELETE FROM ${DB}.${SCHEMA}.SOURCES`,
  `INSERT INTO ${DB}.${SCHEMA}.SOURCES (ISSUE_ID, TITLE, OUTLET, URL, KIND)
   SELECT i.value:id::STRING, s.value:title::STRING, s.value:outlet::STRING, s.value:url::STRING, s.value:kind::STRING
   FROM TABLE(FLATTEN(INPUT => PARSE_JSON(${json}))) i, TABLE(FLATTEN(INPUT => i.value:sources)) s`,
  `CREATE OR REPLACE VIEW ${DB}.${SCHEMA}.APPROVED_ISSUES AS
   SELECT i.*, (SELECT ARRAY_AGG(OBJECT_CONSTRUCT('title', s.TITLE, 'outlet', s.OUTLET, 'url', s.URL, 'kind', s.KIND))
                FROM ${DB}.${SCHEMA}.SOURCES s WHERE s.ISSUE_ID = i.ID) AS SOURCES
   FROM ${DB}.${SCHEMA}.ISSUES i WHERE i.REVIEW_STATUS = 'approved'`,
  `SELECT REVIEW_STATUS, VERIFICATION:status::STRING AS VERIFICATION, COUNT(*) AS ISSUES, COUNT(STORY_CAST) AS CAST FROM ${DB}.${SCHEMA}.ISSUES GROUP BY 1, 2 ORDER BY 1, 2`,
];

if (process.argv.includes('--sql')) {
  if (items.includes('$$')) throw new Error('corpus contains $$; cannot dollar-quote');
  const sql = statements(`$$${items}$$`).map((s) => `${s};`).join('\n\n');
  const out = join(HERE, 'research', 'load.sql');
  writeFileSync(out, `-- Coastal Clash civic corpus: paste into a Snowsight worksheet and Run All.\nUSE WAREHOUSE ${process.env.SNOWFLAKE_WAREHOUSE || 'COMPUTE_WH'};\n\n${sql}\n`);
  console.log(`wrote ${out}`);
  process.exit(0);
}

const account = process.env.SNOWFLAKE_ACCOUNT?.trim();
const token = process.env.SNOWFLAKE_TOKEN?.trim();
if (!account || !token) {
  console.error('Set SNOWFLAKE_ACCOUNT and SNOWFLAKE_TOKEN in .env (or run with --sql to write a worksheet script).');
  process.exit(1);
}
const warehouse = process.env.SNOWFLAKE_WAREHOUSE?.trim() || 'COMPUTE_WH';
const role = process.env.SNOWFLAKE_ROLE?.trim();

/** One statement through the SQL API (POST /api/v2/statements). */
async function run(statement: string, bind: boolean) {
  const res = await fetch(`https://${account}.snowflakecomputing.com/api/v2/statements`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'x-snowflake-authorization-token-type': 'PROGRAMMATIC_ACCESS_TOKEN',
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'coastal-clash-loader/0.1',
    },
    body: JSON.stringify({
      statement,
      timeout: 120,
      warehouse,
      ...(role ? { role } : {}),
      ...(bind ? { bindings: { '1': { type: 'TEXT', value: items } } } : {}),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { message?: string; data?: unknown[][]; resultSetMetaData?: { rowType: { name: string }[] } };
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.message ?? 'no message'}\n  in: ${statement.slice(0, 90).replace(/\s+/g, ' ')}…`);
  return body;
}

for (const s of statements('?')) {
  const result = await run(s, s.includes('?'));
  const head = s.trim().split(/\s+/).slice(0, 4).join(' ');
  if (result.data && /^SELECT/.test(s.trim())) {
    console.log(result.resultSetMetaData?.rowType.map((c) => c.name).join(' | '));
    for (const row of result.data) console.log(row.join(' | '));
  } else console.log(`ok  ${head}`);
}
console.log(`\nLoaded ${corpus.items.length} issues into ${DB}.${SCHEMA}. Approve items with:\n  UPDATE ${DB}.${SCHEMA}.ISSUES SET REVIEW_STATUS = 'approved' WHERE ID IN (...);`);
