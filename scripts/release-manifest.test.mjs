import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createManifest, verifyManifest } from './release-manifest.mjs';
const commit = 'a'.repeat(40);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'widget-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'chat.js'), 'widget');
  mkdirSync(join(root, 'runtime'));
  writeFileSync(join(root, 'runtime', 'index.js'), 'runtime');
  createManifest(root, commit);
  const digest = createHash('sha256').update(readFileSync(join(root, 'release-manifest.json'))).digest('hex');
  return { root, digest };
}
test('verifies every file and source identity', t => {
  const { root, digest } = fixture(t);
  assert.equal(verifyManifest(root, commit, digest).commit, commit);
  assert.throws(() => verifyManifest(root, 'b'.repeat(40), digest), /identity/);
  assert.throws(() => verifyManifest(root, commit, '0'.repeat(64)), /digest/);
});
for (const mutation of ['changed', 'missing', 'extra', 'symlink']) test(`rejects ${mutation} artifacts`, t => {
  const { root, digest } = fixture(t);
  if (mutation === 'changed') writeFileSync(join(root, 'chat.js'), 'tampered');
  if (mutation === 'missing') rmSync(join(root, 'chat.js'));
  if (mutation === 'extra') writeFileSync(join(root, 'extra.js'), 'extra');
  if (mutation === 'symlink') symlinkSync('/etc/passwd', join(root, 'link'));
  assert.throws(() => verifyManifest(root, commit, digest));
});
test('rejects malformed commit and missing entry', t => {
  const { root } = fixture(t);
  assert.throws(() => createManifest(root, 'main'), /SHA/);
  rmSync(join(root, 'chat.js'));
  assert.throws(() => createManifest(root, commit), /chat.js/);
});
