<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Supabase Data API changes

- Read `docs/database-api-access.md` before creating or changing public database objects.
- Create migration files with `supabase migration new`. Put explicit role-specific GRANTs and RLS in the same migration as each new table. Do not depend on automatic grants.
- Public visitors (`anon` and `authenticated`) only read published data; authenticated does not mean administrator. Server-only tables and crawler RPCs must stay inaccessible to both roles.
- Update `supabase/api-access-contract.json` for each new object and run `scripts/check-db-access.mjs` against a disposable local test DB. The GitHub Database API access workflow tests with no automatic grants and no production secrets.
- Historical migrations through `20261014081123` are represented by the structure-only baseline for fresh-database testing. Do not edit them to fix production; add a forward migration. Never apply the baseline to an existing DB, or repair/reset production history to match local filenames.
