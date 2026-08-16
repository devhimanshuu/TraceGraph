/**
 * Verifies the Serverless package artifact before it is deployed.
 *
 * This is the guard that would have caught the production outage: the previous
 * deployment shipped a zip whose node_modules was missing the NestJS runtime,
 * so the handler crashed on every invocation. This script fails the deploy
 * unless:
 *
 *   1. the bundle handler (bundle/lambda.js) is present in the zip, and
 *   2. the runtime is self-contained — i.e. the zip does NOT carry a
 *      node_modules with framework code (it must not be needed, and if the
 *      old packaging path was used again it must not be silently empty).
 *
 * Zip inspection is done by scanning the raw bytes for entry names — no
 * unzip/7z dependency required.
 */
const fs = require('fs');
const path = require('path');

const REQUIRED_ENTRIES = ['bundle/lambda.js'];
// If any of these appear under node_modules/, the package is either broken
// (missing runtime) or not self-contained (shipping a hand-copied node_modules).
const FORBIDDEN_NODE_MODULE_PREFIXES = [
  'node_modules/@nestjs/',
  'node_modules/neo4j-driver/',
  'node_modules/@codegenie/',
  'node_modules/class-validator/',
  'node_modules/class-transformer/',
];

function listZipEntries(zipPath) {
  const buf = fs.readFileSync(zipPath);
  const entries = new Set();
  // Entry names live in the central directory as raw bytes; the EOCD (end of
  // central directory) signature 0x06054b50 anchors the scan. Each entry
  // record starts with 0x02014b50 followed by the name.
  for (let i = 0; i + 4 <= buf.length - 22; i += 1) {
    if (buf.readUInt32LE(i) !== 0x02014b50) continue;
    // filename length is a uint16 at offset 28 of the central dir record.
    const nameLen = buf.readUInt16LE(i + 28);
    if (i + 46 + nameLen > buf.length) continue;
    entries.add(buf.subarray(i + 46, i + 46 + nameLen).toString('utf8'));
    i += 45 + nameLen; // record header minus the 4 signature bytes we read
  }
  return [...entries];
}

function main() {
  const artifactDir = path.resolve(__dirname, '../.serverless');
  const zips = fs
    .readdirSync(artifactDir)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => path.join(artifactDir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (zips.length === 0) {
    console.error('✗ No packaged artifact found in .serverless/. Run `serverless package` first.');
    process.exit(1);
  }

  const zip = zips[0];
  console.log(`Verifying ${path.relative(process.cwd(), zip)}…`);
  const entries = listZipEntries(zip);
  const missing = REQUIRED_ENTRIES.filter((name) => !entries.includes(name));
  const forbidden = entries.filter((name) =>
    FORBIDDEN_NODE_MODULE_PREFIXES.some((prefix) => name.startsWith(prefix)),
  );

  const nodeModuleCount = entries.filter((name) => name.startsWith('node_modules/')).length;

  let failed = false;
  if (missing.length > 0) {
    console.error(`✗ Bundle handler missing from package: ${missing.join(', ')}`);
    failed = true;
  }
  if (forbidden.length > 0) {
    console.error(
      `✗ Package carries node_modules entries (${forbidden.length}) — the deploy is not self-contained. ` +
        'Run `npm run build:lambda` and ensure serverless.yml only packages bundle/.',
    );
    failed = true;
  }
  if (nodeModuleCount > 0) {
    console.warn(`  ⚠ package contains ${nodeModuleCount} node_modules entries (expected 0)`);
  }

  if (failed) {
    process.exit(1);
  }
  console.log(`✓ ${zip.split(/[\\/]/).pop()} looks deployable (bundle present, ${nodeModuleCount} node_modules entries).`);
}

main();
