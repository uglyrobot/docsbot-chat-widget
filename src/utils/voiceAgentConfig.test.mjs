import assert from 'node:assert/strict';
import test from 'node:test';
import { isVoiceAgentCallEnabled } from './voiceAgentConfig.mjs';

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
