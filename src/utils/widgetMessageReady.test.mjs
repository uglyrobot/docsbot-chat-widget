import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import babel from '@babel/core';
import EventEmitter from 'eventemitter3';
import { waitForMessageHandler } from './widgetMessageReady.mjs';

function loadWidget() {
  const emitter = new EventEmitter();
  const source = readFileSync(process.env.WIDGET_TEST_SOURCE || new URL('../components/embeddableWidget/EmbeddableWidget.jsx', import.meta.url), 'utf8');
  const { code } = babel.transformSync(source, {
    configFile: false, babelrc: false, presets: ['@babel/preset-react'],
    plugins: [() => ({ visitor: {
      ImportDeclaration(path) { path.remove(); },
      ExportDefaultDeclaration(path) { path.replaceWith(path.node.declaration); }
    } })]
  });
  const elements = new Map();
  const embed = { appendChild(el) { elements.set(el.id, el); } };
  const document = {
    readyState: 'complete', getElementById(id) { return id === 'docsbot-widget-embed' ? embed : elements.get(id); },
    createElement() { return { style: {} }; }
  };
  const context = { Emitter: emitter, waitForMessageHandler, fontAwesomeConfig: {}, console,
    document, ConfigProvider: {}, EmbeddedChat: {}, App: {},
    React: { createElement: () => ({}) },
    ReactDOM: { createRoot: () => ({ render() { queueMicrotask(() => emitter.emit('docsbot_mount_complete')); } }) }
  };
  const Widget = vm.runInNewContext(code + '\nEmbeddableWidget;', context);
  Widget._root = {};
  return { Widget, emitter, document };
}

for (const send of [false, true]) {
  test(`inline addUserMessage resolves with synchronous handler, send=${send}`, async () => {
    const { Widget, emitter } = loadWidget();
    Widget.isEmbeddedMount = true;
    let received;
    emitter.on('docsbot_add_user_message', (payload) => {
      received = payload;
      emitter.emit('docsbot_add_user_message_complete');
    });
    await Promise.race([Widget.addUserMessage('Find this page', send), new Promise((_, reject) => setTimeout(() => reject(Error('message hung')), 100))]);
    assert.equal(received.message, 'Find this page');
    assert.equal(received.send, send);
    assert.equal(emitter.listenerCount('docsbot_add_user_message_complete'), 0);
  });
}

test('floating message waits for delayed React handler after open', async () => {
  const { Widget, emitter } = loadWidget();
  let received = false;
  emitter.on('docsbot_open', () => {
    queueMicrotask(() => {
      emitter.emit('docsbot_open_complete');
      setTimeout(() => {
        emitter.on('docsbot_add_user_message', () => {
          received = true;
          emitter.emit('docsbot_add_user_message_complete');
        });
        emitter.emit('docsbot_message_ready');
      }, 10);
    });
  });
  await Widget.addUserMessage('Hello', true);
  assert.equal(received, true);
});

test('inline mount creates the root awaited by existing init snippets', async () => {
  const { Widget, document } = loadWidget();
  await Widget.mount({ id: 'team/bot' });
  assert.ok(document.getElementById('docsbotai-root'));
  assert.equal(Widget.isEmbeddedMount, true);
});

test('readiness timeout and unmount clean up listeners', async () => {
  const emitter = new EventEmitter();
  assert.equal(await waitForMessageHandler(emitter, 1), false);
  const pending = waitForMessageHandler(emitter);
  emitter.emit('docsbot_unmount');
  assert.equal(await pending, false);
  assert.deepEqual(emitter.eventNames(), []);
});
