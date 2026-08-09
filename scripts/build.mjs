import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');
const DIST = join(ROOT, 'dist');
const TMP_TESTS = join(ROOT, '.tmp', 'tests');

const argv = new Set(process.argv.slice(2));
const WATCH = argv.has('--watch');
const ZIP = argv.has('--zip');
const TESTS = argv.has('--tests');

const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));

// The manifest references these output names.
const ENTRY_POINTS = {
  content: 'src/content/index.ts',
  background: 'src/background/index.ts',
  popup: 'src/popup/index.ts',
  import: 'src/import/index.ts',
};

const SHARED = {
  bundle: true,
  format: 'iife', // an MV3 content script can't be an ES module
  target: 'chrome102',
  platform: 'browser',
  charset: 'utf8',
  logLevel: 'info',
  minify: false, // the published .zip must stay auditable
  sourcemap: WATCH ? 'inline' : false,
  legalComments: 'inline',
};

async function copyStatic() {
  await mkdir(DIST, { recursive: true });
  await cp(PUBLIC_DIR, DIST, { recursive: true });

  const manifestPath = join(DIST, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  // package.json is the single source of truth for the version.
  manifest.version = pkg.version;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

async function buildTests() {
  const testsDir = join(ROOT, 'tests');
  if (!existsSync(testsDir)) {
    console.log('No tests/ directory yet.');
    return;
  }
  const entries = await collectFiles(testsDir, (f) => f.endsWith('.test.ts'));
  if (entries.length === 0) {
    console.log('No *.test.ts files yet.');
    await mkdir(TMP_TESTS, { recursive: true });
    return;
  }
  await rm(join(ROOT, '.tmp'), { recursive: true, force: true });
  await esbuild.build({
    entryPoints: entries,
    outdir: TMP_TESTS,
    outbase: testsDir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    packages: 'external',
    sourcemap: 'inline',
    outExtension: { '.js': '.mjs' },
      logLevel: 'info',
  });
}

async function collectFiles(dir, predicate) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectFiles(full, predicate)));
    else if (predicate(entry.name)) out.push(full);
  }
  return out;
}

function makeZip() {
  const name = `${pkg.name}-${pkg.version}.zip`;
  const out = join(ROOT, name);
  // -X: omit extra file attributes.
  execFileSync('zip', ['-qrX', out, '.'], { cwd: DIST, stdio: 'inherit' });
  console.log(`\n  ${name} ready for "Load unpacked" or to upload to a Release.`);
}

async function main() {
  if (TESTS) {
    await buildTests();
    return;
  }

  await rm(DIST, { recursive: true, force: true });
  await copyStatic();

  if (WATCH) {
    const ctx = await esbuild.context({ ...SHARED, entryPoints: ENTRY_POINTS, outdir: DIST });
    await ctx.watch();
    // esbuild only watches what it imports; public/ (html, css, manifest) is watched separately.
    watch(PUBLIC_DIR, { recursive: true }, () => {
      copyStatic().then(
        () => console.log('[watch] copied public/'),
        (err) => console.error('[watch] failed to copy public/:', err),
      );
    });
    console.log('\n  Watching for changes. Load dist/ in chrome://extensions and click reload after each build.');
    return;
  }

  await esbuild.build({ ...SHARED, entryPoints: ENTRY_POINTS, outdir: DIST });
  if (ZIP) makeZip();
}

await main();
