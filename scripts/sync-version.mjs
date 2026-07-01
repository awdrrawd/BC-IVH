// Keep the userscript loaders' @version in sync with package.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(root + 'package.json', 'utf8'));
const version = pkg.version;

for (const file of ['loader.user.js', 'loader.local.user.js']) {
  const path = root + file;
  try {
    const src = readFileSync(path, 'utf8');
    const out = src.replace(/(\/\/ @version\s+)\S+/, `$1${version}`);
    if (out !== src) {
      writeFileSync(path, out);
      console.log(`🐈‍⬛ [IVH] synced ${file} -> v${version}`);
    }
  } catch {
    /* loader file may not exist yet */
  }
}
