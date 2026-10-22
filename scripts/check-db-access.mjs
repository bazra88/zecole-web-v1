import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const contract = JSON.parse(read('supabase/api-access-contract.json'));
const literal = s => "'" + s.replaceAll("'", "''") + "'";
const identifier = s => '"' + s.replaceAll('"', '""') + '"';
const assertSql = (condition, message) => `IF NOT (${condition}) THEN RAISE EXCEPTION ${literal(message)}; END IF;`;

// Assert effective rights, not merely the presence of a GRANT string in a file.
// This also rejects a new, undocumented table or an accidental PUBLIC grant.
export function accessAssertions({ requireAll = true } = {}) {
  const checks = [];
  for (const [kind, objects, privileges, fn] of [
    ['tables', contract.tables, ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'], 'has_table_privilege'],
    ['views', contract.views, ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'], 'has_table_privilege'],
    ['sequences', contract.sequences, ['USAGE','SELECT','UPDATE'], 'has_sequence_privilege'],
    ['functions', contract.functions, ['EXECUTE'], 'has_function_privilege'],
  ]) {
    for (const [name, roles] of Object.entries(objects)) {
      const object = 'public.' + (kind === 'functions' ? name : identifier(name));
      const exists = `${kind === 'functions' ? 'to_regprocedure' : 'to_regclass'}(${literal(object)}) IS NOT NULL`;
      if (requireAll) checks.push(assertSql(exists, `Missing ${kind}: ${name}`));
      checks.push(`IF ${exists} THEN`);
      if (kind === 'tables') checks.push(assertSql(`(SELECT relrowsecurity FROM pg_class WHERE oid=${literal(object)}::regclass)`, `RLS disabled: ${name}`));
      if (kind === 'views') checks.push(assertSql(`(SELECT coalesce(reloptions @> ARRAY['security_invoker=true'],false) FROM pg_class WHERE oid=${literal(object)}::regclass)`, `View must use caller permissions: ${name}`));
      for (const [role, allowed] of Object.entries(roles)) {
        for (const privilege of privileges) {
          checks.push(assertSql(`${fn}(${literal(role)},${literal(object)},${literal(privilege)}) = ${allowed.includes(privilege)}`, `${role} ${privilege} mismatch: ${name}`));
        }
      }
      checks.push('END IF;');
    }
  }
  for (const [kinds, names] of [
    ["'r','p'", Object.keys(contract.tables)], ["'v','m'", Object.keys(contract.views)], ["'S'", Object.keys(contract.sequences)],
  ]) checks.push(assertSql(`NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN (${kinds}) AND c.relname NOT IN (${names.map(literal).join(',')}))`, 'Unclassified public object: update API contract with explicit grants and RLS'));
  checks.push(assertSql(`NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.oid NOT IN (${Object.keys(contract.functions).map(n => `coalesce(to_regprocedure(${literal('public.'+n)})::oid,0)`).join(',')},coalesce(to_regprocedure('public.set_updated_at()')::oid,0)))`, 'Unclassified public function'));
  checks.push(assertSql(`NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND cmd <> 'SELECT' AND roles && ARRAY['public','anon','authenticated']::name[])`, 'Unexpected client write policy'));
  return `DO $access_check$ BEGIN\n${checks.join('\n')}\nEND $access_check$;\n`;
}

export function buildPlan() {
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(n => /^\d{14}_.+\.sql$/.test(n) && n.slice(0,14) > contract.after).sort();
  const setup = `-- Disposable, empty PostgreSQL only. No automatic Data API grants.\nCREATE ROLE anon NOLOGIN;\nCREATE ROLE authenticated NOLOGIN;\nCREATE ROLE service_role NOLOGIN BYPASSRLS;\n`;
  return [
    { name: 'isolated roles', sql: setup },
    { name: 'empty database baseline', sql: read(contract.baseline) },
    ...migrations.map(n => ({ name: n, sql: `BEGIN;\n${read('supabase/migrations/'+n)}\n${accessAssertions({requireAll:false})}\nCOMMIT;` })),
    { name: 'full access contract', sql: accessAssertions() },
    { name: 'role and application smoke tests', sql: read('supabase/tests/api-access.sql') },
  ];
}

async function main() {
  if (process.argv.includes('--assertions')) { process.stdout.write(accessAssertions()); return; }
  const plan = buildPlan();
  if (process.argv.includes('--sql')) { process.stdout.write(plan.map(s=>s.sql).join('\n')); return; }
  const pgliteIndex = process.argv.indexOf('--pglite');
  if (pgliteIndex !== -1) {
    const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[pgliteIndex+1])).href);
    const db = new PGlite();
    try {
      for (const step of plan) { await db.exec(step.sql); console.log(`PASS ${step.name}`); }
      let protectedBaseline = false;
      try { await db.exec(read(contract.baseline)); } catch (e) { protectedBaseline = e.message.includes('Baseline requires an empty public schema'); }
      await db.exec('ROLLBACK');
      if (!protectedBaseline) throw new Error('Baseline did not reject a populated schema');
      console.log('PASS baseline refuses an existing schema');
      // Prove a missing GRANT and a newly introduced table cannot silently pass CI.
      for (const mutation of ['REVOKE SELECT ON public.games FROM anon', 'CREATE TABLE public.unclassified_test(id integer)']) {
        await db.exec('BEGIN; '+mutation);
        let rejected = false;
        const expected = mutation.startsWith('REVOKE') ? 'anon SELECT mismatch: games' : 'Unclassified public object';
        try { await db.exec(accessAssertions()); } catch (e) { rejected = e.message.includes(expected); }
        await db.exec('ROLLBACK');
        if (!rejected) throw new Error('Access checker did not reject: '+mutation);
        console.log('PASS negative control: '+mutation);
      }
    } finally { await db.close(); }
    return;
  }
  // No connection URL accepted: this runner must never point at production.
  if (!['127.0.0.1','localhost'].includes(process.env.PGHOST) || process.env.PGDATABASE !== 'zecole_access_test') {
    throw new Error('Use a disposable local PostgreSQL: PGHOST=127.0.0.1 PGDATABASE=zecole_access_test');
  }
  for (const step of plan) {
    const result = spawnSync('psql', ['-X','--set','ON_ERROR_STOP=1'], {input: step.sql, encoding:'utf8', stdio:['pipe','pipe','pipe']});
    if (result.error || result.status !== 0) throw new Error(`${step.name}: ${result.error?.message || result.stderr}`);
    console.log(`PASS ${step.name}`);
  }
  const baselineRetry = spawnSync('psql', ['-X','--set','ON_ERROR_STOP=1'], {input: read(contract.baseline), encoding:'utf8'});
  if (baselineRetry.error || baselineRetry.status === 0 || !baselineRetry.stderr.includes('Baseline requires an empty public schema')) throw new Error('Baseline did not reject an existing schema');
  console.log('PASS baseline refuses an existing schema');
  // Run each failure in its own connection/transaction, so rollback is automatic.
  for (const mutation of ['REVOKE SELECT ON public.games FROM anon', 'CREATE TABLE public.unclassified_test(id integer)']) {
    const result = spawnSync('psql', ['-X','--set','ON_ERROR_STOP=1'], {input: 'BEGIN; '+mutation+';\n'+accessAssertions()+'ROLLBACK;', encoding:'utf8'});
    const expected = mutation.startsWith('REVOKE') ? 'anon SELECT mismatch: games' : 'Unclassified public object';
    if (result.error || result.status === 0 || !result.stderr.includes(expected)) throw new Error('Negative control failed: '+result.stderr);
    console.log('PASS negative control: '+mutation);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
