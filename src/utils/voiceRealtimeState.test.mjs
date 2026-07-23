import assert from 'node:assert/strict';
import test from 'node:test';
import {
	VOICE_CALL_STATUS,
	createVoiceRealtimeState,
	finalVoiceTranscriptFromEvent,
	orderedVoiceTranscripts,
	reduceVoiceRealtimeEvent,
	voiceToolNameFromEvent
} from './voiceRealtimeState.mjs';

test('Realtime events map to every visible voice-call state', () => {
	let state = createVoiceRealtimeState();
	assert.equal(state.status, VOICE_CALL_STATUS.CONNECTING);
	state = reduceVoiceRealtimeEvent(state, {
		type: 'input_audio_buffer.speech_started'
	});
	assert.equal(state.status, VOICE_CALL_STATUS.USER_SPEAKING);
	state = reduceVoiceRealtimeEvent(state, {
		type: 'input_audio_buffer.speech_stopped'
	});
	assert.equal(state.status, VOICE_CALL_STATUS.THINKING);
	state = reduceVoiceRealtimeEvent(state, {
		type: 'response.output_item.added',
		item: {
			id: 'tool-1',
			type: 'function_call',
			name: 'search_documentation'
		}
	});
	assert.equal(state.status, VOICE_CALL_STATUS.USING_TOOL);
	state = reduceVoiceRealtimeEvent(state, {
		type: 'response.output_audio_transcript.delta',
		item_id: 'agent-1',
		delta: 'Hello'
	});
	assert.equal(state.status, VOICE_CALL_STATUS.AGENT_SPEAKING);
	state = reduceVoiceRealtimeEvent(state, { type: 'response.done' });
	assert.equal(state.status, VOICE_CALL_STATUS.LISTENING);
	state = reduceVoiceRealtimeEvent(state, { type: 'error' });
	assert.equal(state.status, VOICE_CALL_STATUS.ERROR);
});

test('asynchronous caller and agent transcripts reconcile by item_id', () => {
	let state = createVoiceRealtimeState();
	state = reduceVoiceRealtimeEvent(state, {
		type: 'input_audio_buffer.speech_started',
		item_id: 'caller-1'
	});
	state = reduceVoiceRealtimeEvent(state, {
		type: 'response.output_item.added',
		item: { id: 'agent-1', type: 'message', role: 'assistant' }
	});
	state = reduceVoiceRealtimeEvent(state, {
		type: 'response.output_audio_transcript.delta',
		item_id: 'agent-1',
		delta: 'The '
	});
	state = reduceVoiceRealtimeEvent(state, {
		type: 'conversation.item.input_audio_transcription.completed',
		item_id: 'caller-1',
		transcript: 'What is the return policy?'
	});
	state = reduceVoiceRealtimeEvent(state, {
		type: 'response.output_audio_transcript.delta',
		item_id: 'agent-1',
		delta: 'answer'
	});
	state = reduceVoiceRealtimeEvent(state, {
		type: 'response.output_audio_transcript.done',
		item_id: 'agent-1',
		transcript: 'The answer is here.'
	});

	assert.deepEqual(orderedVoiceTranscripts(state), [
		{
			itemId: 'caller-1',
			role: 'caller',
			text: 'What is the return policy?',
			isFinal: true
		},
		{
			itemId: 'agent-1',
			role: 'agent',
			text: 'The answer is here.',
			isFinal: true
		}
	]);
	assert.deepEqual(
		finalVoiceTranscriptFromEvent({
			type: 'conversation.item.input_audio_transcription.completed',
			item_id: 'caller-1',
			transcript: '  Final caller text  '
		}),
		{ itemId: 'caller-1', role: 'caller', text: 'Final caller text' }
	);
});

test('tool state accepts only a safe name and never retains internals', () => {
	const event = {
		type: 'response.output_item.added',
		item: {
			id: 'tool-1',
			type: 'function_call',
			name: 'search_documentation',
			arguments: '{"credential":"do-not-show"}',
			output: 'private retrieval context'
		}
	};
	const state = reduceVoiceRealtimeEvent(createVoiceRealtimeState(), event);
	assert.equal(voiceToolNameFromEvent(event), 'search_documentation');
	assert.equal(state.activeToolName, 'search_documentation');
	assert.doesNotMatch(JSON.stringify(state), /credential|retrieval context/);
	assert.equal(
		voiceToolNameFromEvent({
			...event,
			item: { ...event.item, name: 'unsafe function name!' }
		}),
		''
	);
});
