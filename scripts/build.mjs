// SPDX-License-Identifier: MIT
//
// Build de la extensión, solo con esbuild.
//
//   node scripts/build.mjs            compila una vez a dist/
//   node scripts/build.mjs --watch    recompila al guardar
//   node scripts/build.mjs --zip      compila y empaqueta dist/
//   node scripts/build.mjs --tests    compila tests/ para `node --test`
//
// Dos decisiones deliberadas: formato 'iife' porque un content script de MV3 no
// puede ser un módulo ES, y sin minificar para que el .zip publicado se pueda auditar.

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

/** Entradas de la extensión. Los nombres de salida los referencia el manifest. */
const ENTRY_POINTS = {
  content: 'src/content/index.ts',
  background: 'src/background/index.ts',
  popup: 'src/popup/index.ts',
  import: 'src/import/index.ts',
};

const SHARED = {
  bundle: true,
  format: 'iife',
  target: 'chrome102',
  platform: 'browser',
  charset: 'utf8',
  logLevel: 'info',
  minify: false,
  sourcemap: WATCH ? 'inline' : false,
  legalComments: 'inline',
};

/** Copia public/ a dist/ e inyecta la versión de package.json en el manifest. */
async function copyStatic() {
  await mkdir(DIST, { recursive: true });
  await cp(PUBLIC_DIR, DIST, { recursive: true });

  const manifestPath = join(DIST, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  // package.json es la única fuente de verdad de la versión.
  manifest.version = pkg.version;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

/** Compila tests/**\/*.test.ts a .tmp/tests/ como ESM de Node. */
async function buildTests() {
  const testsDir = join(ROOT, 'tests');
  if (!existsSync(testsDir)) {
    console.log('No hay tests/ todavía.');
    return;
  }
  const entries = await collectFiles(testsDir, (f) => f.endsWith('.test.ts'));
  if (entries.length === 0) {
    console.log('No hay archivos *.test.ts todavía.');
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
  // -r recursivo, -q silencioso, -X sin metadatos de sistema de archivos.
  execFileSync('zip', ['-qrX', out, '.'], { cwd: DIST, stdio: 'inherit' });
  console.log(`\n  ${name} listo para «Cargar descomprimida» o para subir a un Release.`);
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
    // esbuild solo vigila lo que importa; public/ (html, css, manifest) va aparte.
    watch(PUBLIC_DIR, { recursive: true }, () => {
      copyStatic().then(
        () => console.log('[watch] public/ copiado'),
        (err) => console.error('[watch] fallo copiando public/:', err),
      );
    });
    console.log('\n  Vigilando cambios. Carga dist/ en chrome://extensions y pulsa recargar tras cada build.');
    return;
  }

  await esbuild.build({ ...SHARED, entryPoints: ENTRY_POINTS, outdir: DIST });
  if (ZIP) makeZip();
}

await main();
