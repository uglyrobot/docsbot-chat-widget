// Dependency-free verification runs in the deployment job. Never execute bundle code here.
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const manifestName = 'release-manifest.json';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function inventory(root, dir = root) {
  const files = Object.create(null);
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Symlink is not a release artifact: ${path}`);
    if (stat.isDirectory()) Object.assign(files, inventory(root, path));
    else if (stat.isFile()) {
      const key = relative(root, path).split(sep).join('/');
      if (key !== manifestName) files[key] = sha256(readFileSync(path));
    } else throw new Error(`Non-regular release artifact: ${path}`);
  }
  return files;
}
export function createManifest(root, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Expected full commit SHA');
  const files = inventory(root);
  if (!files['chat.js']) throw new Error('Missing chat.js');
  const manifest = { schema: 1, commit, files };
  writeFileSync(join(root, manifestName), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
export function verifyManifest(root, commit, expectedDigest) {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest || '')) throw new Error('Expected manifest SHA-256');
  const path = join(root, manifestName);
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error('Invalid manifest file');
  const bytes = readFileSync(path);
  if (sha256(bytes) !== expectedDigest) throw new Error('Manifest digest mismatch');
  const manifest = JSON.parse(bytes);
  if (manifest.schema !== 1 || manifest.commit !== commit) throw new Error('Release identity mismatch');
  const actual = inventory(root);
  if (!actual['chat.js'] || JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new Error('Release files differ from manifest');
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, root, commit, digest] = process.argv.slice(2);
  if (mode === 'create') createManifest(root, commit);
  else if (mode === 'verify') verifyManifest(root, commit, digest);
  else throw new Error('Usage: release-manifest.mjs create|verify DIRECTORY COMMIT [MANIFEST_SHA256]');
}
