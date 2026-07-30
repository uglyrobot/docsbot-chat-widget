import assert from 'node:assert/strict';
import test from 'node:test';
import {
	clearPendingStartVoiceCall,
	hasPendingStartVoiceCall,
	markPendingStartVoiceCall,
	takePendingStartVoiceCall
} from './voiceCallJsApi.mjs';

test('pending startVoiceCall flag is one-shot', () => {
	clearPendingStartVoiceCall();
	assert.equal(hasPendingStartVoiceCall(), false);
	assert.equal(takePendingStartVoiceCall(), false);

	markPendingStartVoiceCall();
	assert.equal(hasPendingStartVoiceCall(), true);
	assert.equal(takePendingStartVoiceCall(), true);
	assert.equal(hasPendingStartVoiceCall(), false);
	assert.equal(takePendingStartVoiceCall(), false);

	markPendingStartVoiceCall();
	clearPendingStartVoiceCall();
	assert.equal(takePendingStartVoiceCall(), false);
});
