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

test('local dev can override voice-agent calling from embed options', () => {
	assert.equal(
		resolveEffectiveVoiceAgentCallEnabled(false, true, { localDev: true }),
		true
	);
	assert.equal(
		resolveEffectiveVoiceAgentCallEnabled(true, false, { localDev: true }),
		false
	);
	assert.equal(
		resolveEffectiveVoiceAgentCallEnabled(false, true, { localDev: false }),
		false
	);
	assert.equal(
		resolveEffectiveVoiceAgentCallEnabled(true, undefined, { localDev: true }),
		true
	);
});
