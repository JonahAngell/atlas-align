# Parser spike results (Phase 0, decision C7)

Issue 6060. Run on 2026-11-20 against the G1 gold set (`test/fixtures/code-import/g1/`, 9 audits × 2 dialects) and the two construct fixtures in `test/fixtures/code-import/constructs/`. The candidate packages were installed in a scratch folder only. Nothing was added to `package.json`.

## Decision

**Keep the hand-written facts lexers** (`src/ai/code/facts/`) for Phases 1 and 2. Neither parser is added as a dependency. The facts format stays the same either way (plan §3.3), so this can be revisited without changing anything downstream.

## T-SQL: node-sql-parser 5.3.13 (TransactSQL build)

| Check                             | Result                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1 SQL scripts parsed             | 6 of 9                                                                                                                                           |
| Why the other 3 fail              | ATLAS copies free-text expressions as written (for example `REPORT DATE - start_date`)                                                           |
| Effect of one bad line            | The whole script fails, because the export is one `WITH` statement. That gives 0 facts instead of most.                                          |
| Constructs it can't parse (§11.1) | `SET @var = …`, `EXEC sp_executesql`, `MERGE`                                                                                                    |
| Constructs it parses              | `USE`, `DECLARE`, `SELECT … INTO #t`, table hints, CTEs, `ROW_NUMBER`/`COUNT(*) OVER`, `CROSS APPLY`, `PIVOT`, `UNION ALL`, cursors, `IF EXISTS` |
| Package size                      | 89 MB installed                                                                                                                                  |
| Lexer on the same files           | All 10 files read. One data set per CTE on every G1 script. 0.1–8 ms per file.                                                                   |

A tree-sitter SQL grammar (`@derekstride/tree-sitter-sql` 0.3.13) was also considered. It ships no prebuilt WebAssembly grammar, and building one needs an Emscripten toolchain, so it wasn't tried.

## pandas: web-tree-sitter 0.25.10 with tree-sitter-python 0.25.0

| Check                             | Result                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| G1 pandas scripts parsed          | 9 of 9. It's error tolerant: ATLAS's free-text lines become `ERROR` nodes (12, 1 and 1 in 3 files)                |
| Statement boundaries vs the lexer | Identical on all 9 G1 scripts (5 to 277 statements in `run_audit`)                                                |
| Hand-written fixture              | 28 vs 29: tree-sitter counts a `for` body as part of the loop, while the lexer lists it on its own line           |
| Speed                             | 0.3–7.7 ms per file. The lexer takes 0.1–4.2 ms.                                                                  |
| What it adds                      | A syntax tree only. Every pandas meaning (filters, masks, merges, `np.where`) would still be hand-written on top. |
| Package size                      | 13 MB (runtime plus the grammar's WebAssembly file)                                                               |

## What would change the decision

- **G2 shows boundary errors.** G2 (human-style rewrites) has to be written and reviewed by a person (plan §8.1), so it doesn't exist yet. If the lexer splits or joins statements wrongly on G2, adopt tree-sitter for Python statement boundaries only and keep the pandas rules.
- **A T-SQL parser that degrades per statement.** A parser that fails per statement, not per file, and handles `SET`, `MERGE` and `sp_executesql`, would be worth a second look.

## Other Phase 0 findings

- **No export refactor needed.** `src/ai/code/export-sandbox.js` runs `js/12b-code-export.js` unchanged in `node:vm` with `state.audit` set. Plan §3.6 and the Phase 0 row described a refactor that isn't needed.
- **G1 is smaller than planned.** Only 9 of the 19 audits in `audits/` (plus the DIESI import) have steps, so G1 is 18 scripts, not 40. G2 at 2 variants per script would be 36, not 80.
- **ATLAS's export joins by alias.** Some SQL joins name the alias as the table (`LEFT JOIN [sap.currency] AS [sap.currency]`), and the header lists both. The round trip (§3.6) has to treat a source's name and alias as the same table.
