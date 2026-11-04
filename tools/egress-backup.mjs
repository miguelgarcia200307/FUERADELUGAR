import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedProject = 'gacqqaimdfvkmznsglpg';
const envText = await readFile(resolve(root, '.env.local'), 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
  const split = line.indexOf('=');
  return [line.slice(0, split), line.slice(split + 1)];
}));
if (new URL(env.SUPABASE_URL).hostname.split('.')[0] !== expectedProject) throw new Error('El URL configurado no corresponde al proyecto esperado.');
if (!env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_')) throw new Error('Falta SUPABASE_SECRET_KEY local.');

const base = env.SUPABASE_URL.replace(/\/$/, '');
const headers = { apikey: env.SUPABASE_SECRET_KEY, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = resolve(root, 'backups', timestamp);
await mkdir(backupDir, { recursive: true });

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    signal: AbortSignal.timeout(45_000),
    headers: { ...headers, ...init.headers }
  });
  if (!response.ok) throw new Error(`Supabase respondió ${response.status} en ${path}.`);
  return response;
}

const schemaResponse = await request('/rest/v1/');
const schema = await schemaResponse.json();
const tables = {};
for (const table of Object.keys(schema.definitions || {}).sort()) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const response = await request(`/rest/v1/${encodeURIComponent(table)}?select=*`, {
      headers: { Range: `${from}-${from + 499}`, 'Range-Unit': 'items' }
    });
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`Respuesta inesperada al respaldar la tabla ${table}.`);
    rows.push(...page);
    if (page.length < 500) break;
  }
  tables[table] = rows;
}

const exportedAt = new Date().toISOString();
await writeFile(resolve(backupDir, 'database-public.json'), JSON.stringify({ projectRef: expectedProject, exportedAt, tables }, null, 2));
await writeFile(resolve(backupDir, 'public-schema.json'), JSON.stringify({ exportedAt, definitions: schema.definitions }, null, 2));
process.stdout.write(JSON.stringify({
  projectRef: expectedProject,
  apiStatus: schemaResponse.status,
  backupDir: backupDir.replace(`${root}\\`, '.\\').replace(`${root}/`, './'),
  tableCounts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]))
}, null, 2));
