import assert from 'node:assert/strict';
import test from 'node:test';
import { orderedListGutter } from './orderedListGutter.mjs';

test('normal lists keep a compact two-digit gutter', () => {
  assert.equal(orderedListGutter(), 'calc(2ch + 0.75em)');
  assert.equal(orderedListGutter(1, 99), 'calc(2ch + 0.75em)');
});
test('gutter covers wide starting values and digit boundaries', () => {
  assert.equal(orderedListGutter(100, 2), 'calc(3ch + 0.75em)');
  assert.equal(orderedListGutter(1, 100), 'calc(3ch + 0.75em)');
  assert.equal(orderedListGutter(999, 2), 'calc(4ch + 0.75em)');
  assert.equal(orderedListGutter(999999999, 2), 'calc(10ch + 0.75em)');
});
