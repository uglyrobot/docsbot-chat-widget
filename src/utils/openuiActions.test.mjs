import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenUIActionMessage, readOpenUIActionMessage, dispatchOpenUIAction } from './openuiActions.mjs';

test('action text is compact while model content preserves form and item context', () => {
  const message = buildOpenUIActionMessage({type:'continue_conversation',humanFriendlyMessage:'Save preferences',formName:'preferences',formState:{name:{value:'Café 日本語'},urgent:{value:false},count:{value:0},tags:{value:['a','b']}},params:{context:'Selected card 42'}});
  const submission = readOpenUIActionMessage(message);
  assert.equal(submission.display, 'Save preferences');
  assert.equal(submission.form, 'preferences');
  assert.equal(submission.context.context, 'Selected card 42');
  assert.deepEqual(submission.entries.map(x=>x.value), ['Café 日本語','false','0','a, b']);
  assert.ok(message.includes('Selected card 42'));
});
test('named forms, plain messages and malformed data are handled safely', () => {
  assert.equal(readOpenUIActionMessage('Hello'), null);
  assert.equal(readOpenUIActionMessage('User clicked: Save\nUI submission: {broken}'), null);
  const submission = readOpenUIActionMessage(buildOpenUIActionMessage({type:'continue_conversation',humanFriendlyMessage:'Submit',formState:{contact:{email:{value:'a@example.invalid'}}}}));
  assert.deepEqual(submission.entries,[{label:'contact / email',value:'a@example.invalid'}]);
});
test('unsupported, cyclic and oversized actions do not send', () => {
  assert.equal(buildOpenUIActionMessage({type:'open_url'}), null);
  assert.equal(buildOpenUIActionMessage({type:'continue_conversation',formState:{x:'a'.repeat(10001)}}),null);
  const state={};state.self=state;
  assert.equal(buildOpenUIActionMessage({type:'continue_conversation',formState:state}), null);
});
test('host can cancel default handling synchronously', () => {
  let captured;
  class Event { constructor(type,options){Object.assign(this,{type},options)} }
  assert.equal(dispatchOpenUIAction({messageId:'123'}, {dispatchEvent(event){captured=event;return false}}, Event),false);
  assert.equal(captured.type,'docsbot_ui_action');
  assert.equal(captured.cancelable,true);
  assert.equal(captured.detail.messageId,'123');
});
