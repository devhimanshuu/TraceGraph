/**
 * Builds the Lambda artifact: compiles with tsc, then bundles the compiled
 * handler into a single self-contained bundle/lambda.js with esbuild.
 *
 * Why a bundle instead of shipping compiled dist/ + node_modules?
 * The previous deploy shipped `dist/lambda.js` (tsc output) alongside a
 * hand-copied node_modules — when the node_modules copy was incomplete, every
 * invocation crashed with "Cannot find module '@nestjs/core'". A bundle
 * inlines ALL runtime dependencies, so the Lambda package is one file and this
 * failure class is impossible.
 *
 * Why compile with tsc first instead of letting esbuild transpile src/?
 * NestJS dependency injection relies on TypeScript's `emitDecoratorMetadata`
 * (`design:paramtypes`), which esbuild's transpiler cannot emit. Compiling
 * with tsc first bakes that metadata into the JS, then esbuild just inlines
 * the node_modules requires.
 *
 * NestJS lazy-imports stay external (mirrors the old webpack.config.js
 * IgnorePlugin list): they are only loaded on-demand by @nestjs/core through
 * `loadPackage` (which swallows MODULE_NOT_FOUND) and are never used by this
 * app, so excluding them keeps the bundle lean.
 */
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');
const path = require('path');

const API_DIR = path.resolve(__dirname, '..');

const LAZY_EXTERNALS = [
  '@nestjs/microservices',
  '@nestjs/microservices/*',
  '@nestjs/websockets',
  '@nestjs/websockets/*',
  'cache-manager',
  'class-transformer/storage',
  'fastify-swagger',
  'point-of-view',
];

async function main() {
  // 1. Compile with tsc so decorator metadata (design:paramtypes) is emitted.
  //    Run the local typescript bin through node so it works on Windows too.
  const tscBin = require.resolve('typescript/bin/tsc', { paths: [API_DIR] });
  console.log('Compiling with tsc (emits NestJS decorator metadata)…');
  execFileSync(process.execPath, [tscBin, '-p', 'tsconfig.build.json'], {
    cwd: API_DIR,
    stdio: 'inherit',
  });

  // 2. Bundle the compiled handler — inlines every runtime dependency.
  const result = await esbuild.build({
    entryPoints: [path.resolve(API_DIR, 'dist/lambda.js')],
    outfile: path.resolve(API_DIR, 'bundle/lambda.js'),
    bundle: true,
    platform: 'node',
    // Lambda runtime nodejs24.x — keep CJS/ESM features Node 24 supports.
    target: 'node24',
    format: 'cjs',
    sourcemap: true,
    minify: false,
    external: LAZY_EXTERNALS,
    logLevel: 'info',
    metafile: true,
  });

  const bytes = Object.values(result.metafile.outputs).reduce(
    (sum, output) => sum + output.bytes,
    0,
  );
  console.log(`Lambda bundle written to bundle/lambda.js (${(bytes / 1024).toFixed(0)} KiB inlined)`);
}

main().catch((err) => {
  console.error('Lambda bundle build failed:', err);
  process.exit(1);
});
