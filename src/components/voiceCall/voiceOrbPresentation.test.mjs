import assert from 'node:assert/strict';
import test from 'node:test';
import { VOICE_CALL_STATUS } from '../../utils/voiceRealtimeState.mjs';
import {
	isVoiceSearchToolName,
	voiceOrbPresentation
} from './voiceOrbPresentation.mjs';

test('search tool names are only docs and web retrieval', () => {
	assert.equal(isVoiceSearchToolName('search_documentation'), true);
	assert.equal(isVoiceSearchToolName('web_search'), true);
	assert.equal(isVoiceSearchToolName('web_search_call'), true);
	assert.equal(isVoiceSearchToolName('web_search_preview'), true);
	assert.equal(isVoiceSearchToolName('my_custom_skill'), false);
	assert.equal(isVoiceSearchToolName('stripe_billing_portal'), false);
	assert.equal(isVoiceSearchToolName(''), false);
});

test('USING_TOOL orb is searching for retrieval and solving for skills', () => {
	assert.equal(
		voiceOrbPresentation(
			VOICE_CALL_STATUS.USING_TOOL,
			'search_documentation'
		).orbState,
		'searching'
	);
	assert.equal(
		voiceOrbPresentation(VOICE_CALL_STATUS.USING_TOOL, 'web_search')
			.orbState,
		'searching'
	);
	assert.equal(
		voiceOrbPresentation(VOICE_CALL_STATUS.USING_TOOL, 'my_skill')
			.orbState,
		'solving'
	);
	assert.equal(
		voiceOrbPresentation(VOICE_CALL_STATUS.USING_TOOL, '').orbState,
		'solving'
	);
	assert.equal(
		voiceOrbPresentation(VOICE_CALL_STATUS.THINKING).orbState,
		'solving'
	);
	assert.equal(
		voiceOrbPresentation(VOICE_CALL_STATUS.LISTENING).orbState,
		'working'
	);
	assert.equal(
		voiceOrbPresentation(VOICE_CALL_STATUS.CONNECTING).orbState,
		'working'
	);
	assert.equal(
		voiceOrbPresentation(VOICE_CALL_STATUS.ERROR).orbState,
		'shaping'
	);
	assert.equal(
		voiceOrbPresentation(VOICE_CALL_STATUS.ENDED).orbState,
		'shaping'
	);
});
