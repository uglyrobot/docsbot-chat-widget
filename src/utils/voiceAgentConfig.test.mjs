import assert from 'node:assert/strict';
import test from 'node:test';
import {
	isVoiceAgentCallEnabled,
	resolveEffectiveVoiceAgentCallEnabled
} from './voiceAgentConfig.mjs';

test('voice-agent calling is enabled only by the exact server capability flag', () => {
	assert.equal(isVoiceAgentCallEnabled({ useVoiceAgent: true }), true);
	assert.equal(isVoiceAgentCallEnabled({ useVoiceAgent: false }), false);
	assert.equal(isVoiceAgentCallEnabled({ useAudioUpload: true }), false);
	assert.equal(isVoiceAgentCallEnabled({ useVoiceAgent: 'true' }), false);
	assert.equal(
		isVoiceAgentCallEnabled({ voiceAgent: { enabled: true } }),
		false
	);
	assert.equal(isVoiceAgentCallEnabled(null), false);
});

test('embed options.useVoiceAgent overrides server capability when set', () => {
	assert.equal(resolveEffectiveVoiceAgentCallEnabled(false, true), true);
	assert.equal(resolveEffectiveVoiceAgentCallEnabled(true, false), false);
	assert.equal(resolveEffectiveVoiceAgentCallEnabled(false, 'true'), false);
	assert.equal(resolveEffectiveVoiceAgentCallEnabled(true, undefined), true);
	assert.equal(resolveEffectiveVoiceAgentCallEnabled(false, undefined), false);
});
