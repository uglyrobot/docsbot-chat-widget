import test from 'node:test';
import assert from 'node:assert/strict';
import { observeMessageViewport } from './observeMessageViewport.mjs';

test('composer growth exposes latest-message control without a scroll event or forced jump', () => {
  const element = new EventTarget();
  Object.assign(element, {scrollTop: 600, clientHeight: 400, scrollHeight: 1000});
  let resize, observed, disconnected = false, atBottom;
  class Observer {
    constructor(callback) { resize = callback; }
    observe(target) { observed = target; }
    disconnect() { disconnected = true; }
  }
  let updates = 0;
  const stop = observeMessageViewport(element, () => {
    updates++;
    atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
  }, Observer);
  assert.equal(observed, element);
  assert.equal(atBottom, true);
  element.clientHeight = 310;
  resize();
  assert.equal(atBottom, false);
  assert.equal(element.scrollTop, 600); // Preserve reading position.
  element.scrollTop = 690;
  element.dispatchEvent(new Event('scroll'));
  assert.equal(atBottom, true);
  stop();
  assert.equal(disconnected, true);
  const before = updates;
  element.dispatchEvent(new Event('scroll'));
  assert.equal(updates, before);
});

test('scroll tracking still works without ResizeObserver and tolerates an absent viewport', () => {
  let updates = 0;
  const element = new EventTarget();
  const stop = observeMessageViewport(element, () => updates++, null);
  element.dispatchEvent(new Event('scroll'));
  assert.equal(updates, 2);
  stop();
  observeMessageViewport(null, () => {throw new Error('No viewport');}, null)();
});
