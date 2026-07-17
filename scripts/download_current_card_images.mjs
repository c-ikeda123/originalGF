import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { godfieldCurrentImages } from './godfieldCurrentImages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const localUrl of Object.values(godfieldCurrentImages)) {
  const sourceUrl = `https://godfield.net${localUrl.replace('/godfield-current', '')}`;
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`${response.status} ${sourceUrl}`);
  const output = resolve(root, 'frontend', 'public', localUrl.slice(1));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(await response.arrayBuffer()));
}

console.log(`Downloaded ${Object.keys(godfieldCurrentImages).length} current card images.`);
