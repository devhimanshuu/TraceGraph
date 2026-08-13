/**
 * Generates apps/web/app/apple-icon.png (180×180) from the brand mark SVG.
 *
 *   node scripts/generate-apple-icon.mjs
 *
 * Uses sharp (bundled with Next.js) — no image tooling required.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(root, '..', 'app', 'icon.svg');
const target = path.join(root, '..', 'app', 'apple-icon.png');

const svg = await readFile(source);
const png = await sharp(svg).resize(180, 180).png().toBuffer();
await writeFile(target, png);

console.log(`apple-icon.png written (${png.length} bytes)`);
