import assert from 'node:assert/strict';
import test from 'node:test';
import {
	VOICE_TOOL_WORKING_CHIME_VOLUME,
	createVoiceToolWorkingChime
} from './voiceToolWorkingChime.mjs';

function createFakeAudio() {
	return {
		loop: false,
		preload: '',
		playsInline: false,
		volume: 1,
		muted: false,
		currentTime: 0,
		playCalls: 0,
		pauseCalls: 0,
		failPlay: false,
		play() {
			this.playCalls += 1;
			if (this.failPlay) {
				return Promise.reject(new Error('NotAllowedError'));
			}
			return Promise.resolve();
		},
		pause() {
			this.pauseCalls += 1;
		},
		removeAttribute() {},
		load() {}
	};
}

test('voice tool working chime requires prime before audible playback', async () => {
	let created = null;
	const FakeAudio = function FakeAudio() {
		created = createFakeAudio();
		return created;
	};

	const chime = createVoiceToolWorkingChime({
		src: 'voice-tool-working.mp3',
		AudioCtor: FakeAudio
	});

	chime.setActive(true);
	assert.ok(created);
	assert.equal(created.loop, true);
	// Not unlocked yet — play must not start for real.
	assert.equal(created.playCalls, 0);

	assert.equal(await chime.prime(), true);
	assert.ok(created.playCalls >= 1);
	assert.equal(created.volume, VOICE_TOOL_WORKING_CHIME_VOLUME);

	const playsAfterPrime = created.playCalls;
	chime.setActive(true);
	assert.equal(created.playCalls, playsAfterPrime + 1);

	chime.setActive(false);
	assert.ok(created.pauseCalls >= 1);
	assert.equal(created.currentTime, 0);
});

test('prime treats a pause-interrupted play (AbortError) as unlocked', async () => {
	let created = null;
	const FakeAudio = function FakeAudio() {
		created = createFakeAudio();
		created.play = function play() {
			this.playCalls += 1;
			const error = new Error('The play() request was interrupted');
			error.name = 'AbortError';
			return Promise.reject(error);
		};
		return created;
	};

	const chime = createVoiceToolWorkingChime({
		src: 'voice-tool-working.mp3',
		AudioCtor: FakeAudio
	});

	assert.equal(await chime.prime(), true);
});

test('prime dedupes concurrent calls', async () => {
	let created = null;
	const FakeAudio = function FakeAudio() {
		created = createFakeAudio();
		return created;
	};

	const chime = createVoiceToolWorkingChime({
		src: 'voice-tool-working.mp3',
		AudioCtor: FakeAudio
	});

	const [a, b] = await Promise.all([chime.prime(), chime.prime()]);
	assert.equal(a, true);
	assert.equal(b, true);
	// Both callers shared the same in-flight unlock.
	assert.equal(created.playCalls, 1);
});

test('voice tool working chime respects mute and disposes cleanly', async () => {
	let created = null;
	const FakeAudio = function FakeAudio() {
		created = createFakeAudio();
		return created;
	};

	const chime = createVoiceToolWorkingChime({
		src: 'voice-tool-working.mp3',
		AudioCtor: FakeAudio
	});

	await chime.prime();
	chime.setActive(true);
	assert.ok(created.playCalls >= 2);

	chime.setMuted(true);
	assert.equal(created.muted, true);
	assert.ok(created.pauseCalls >= 1);

	chime.setMuted(false);
	assert.equal(created.muted, false);
	assert.ok(created.playCalls >= 3);

	chime.dispose();
	assert.ok(created.pauseCalls >= 2);
});

test('shared chime primes from a gesture helper and stays unlocked', async () => {
	let created = null;
	const FakeAudio = function FakeAudio() {
		created = createFakeAudio();
		return created;
	};

	// Isolate shared singleton for this test.
	const previousAudio = globalThis.Audio;
	globalThis.Audio = FakeAudio;
	try {
		const {
			getSharedVoiceToolWorkingChime,
			primeSharedVoiceToolWorkingChime
		} = await import('./voiceToolWorkingChime.mjs');

		assert.equal(
			await primeSharedVoiceToolWorkingChime('shared-src.mp3'),
			true
		);
		const chime = getSharedVoiceToolWorkingChime('shared-src.mp3');
		chime.setActive(true);
		assert.ok(created.playCalls >= 2);
		chime.setActive(false);
	} finally {
		globalThis.Audio = previousAudio;
	}
});
