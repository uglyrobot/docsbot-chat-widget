import { test } from 'node:test';
import assert from 'node:assert/strict';
import { helpdeskStorageKey, readHelpdeskSession, isLiveHelpdesk, publicHelpdeskMessages } from './helpdeskSession.mjs';
test('capabilities are scoped to team, bot and the current conversation', () => {
  assert.notEqual(helpdeskStorageKey('one', 'bot'), helpdeskStorageKey('two', 'bot'));
  const storage = { getItem: () => JSON.stringify({conversationId:'a', token:'secret'}) };
  assert.equal(readHelpdeskSession(storage, 'key', 'a').token, 'secret');
  assert.equal(readHelpdeskSession(storage, 'key', 'b'), null);
  assert.equal(readHelpdeskSession({getItem: () => '{'}, 'key', 'a'), null);
});
test('only paused live conversations route to operators and only public replies render', () => {
  assert.equal(isLiveHelpdesk({mode:'live', aiPaused:true, status:'open'}), true);
  assert.equal(isLiveHelpdesk({mode:'live', aiPaused:false, status:'open'}), false);
  assert.equal(isLiveHelpdesk({mode:'ticket', aiPaused:true, status:'open'}), true);
  assert.equal(isLiveHelpdesk({mode:'live', aiPaused:true, status:'resolved'}), false);
  assert.deepEqual(publicHelpdeskMessages([{id:'1',type:'reply',sender:'agent',text:'hi'}, {id:'2',type:'note',sender:'agent',text:'private'}, {id:'3',type:'reply',sender:'visitor',text:'hi'}]).map(m => m.id), ['1']);
});

test('attachment descriptors are limited to public replies and names cannot contain paths or control bytes', async () => {
  const { publicHelpdeskAttachments, safeHelpdeskFilename } = await import('./helpdeskSession.mjs');
  const file = {id:'file-id',name:'notes.txt',size:3,mime:'text/plain',storagePath:'secret'};
  assert.deepEqual(publicHelpdeskAttachments({type:'note',sender:'agent',attachments:[file]}), []);
  assert.deepEqual(publicHelpdeskAttachments({type:'reply',sender:'visitor',attachments:[file]}), []);
  assert.deepEqual(publicHelpdeskAttachments({type:'reply',sender:'agent',attachments:[file, {id:'',name:'bad'}, {id:'..',name:'traversal'}]}), [{id:'file-id',name:'notes.txt',size:3,mime:'text/plain'}]);
  assert.equal(safeHelpdeskFilename('../folder/file\u0000.html'), '_folder_file_.html');
});
