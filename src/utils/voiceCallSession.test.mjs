import assert from 'node:assert/strict';
import test from 'node:test';
import {
	DocsBotVoiceCallSession,
	VoiceCallSessionError,
	buildVoiceWebrtcRequest,
	buildVoiceWidgetPublicMetadata,
	microphoneLevelFromByteTimeDomain,
	remoteAudioLevelFromByteTimeDomain,
	waitForIceGatheringComplete
} from './voiceCallSession.mjs';

test('microphone level ignores silence and maps amplitude into a bounded visual range', () => {
	assert.equal(
		microphoneLevelFromByteTimeDomain(new Uint8Array(32).fill(128)),
		0
	);
	assert.ok(
		microphoneLevelFromByteTimeDomain(new Uint8Array(32).fill(148)) > 0
	);
	assert.equal(
		microphoneLevelFromByteTimeDomain(new Uint8Array(32).fill(255)),
		1
	);
});

test('remote audio level maps output amplitude into a bounded visual range', () => {
	assert.equal(
		remoteAudioLevelFromByteTimeDomain(new Uint8Array(32).fill(128)),
		0
	);
	assert.ok(
		remoteAudioLevelFromByteTimeDomain(new Uint8Array(32).fill(148)) > 0
	);
	assert.equal(
		remoteAudioLevelFromByteTimeDomain(new Uint8Array(32).fill(255)),
		1
	);
});

test('ICE gathering fails with a safe bounded timeout', async () => {
	const listeners = new Map();
	const peerConnection = {
		iceGatheringState: 'gathering',
		addEventListener: (name, listener) => listeners.set(name, listener),
		removeEventListener: (name) => listeners.delete(name)
	};

	await assert.rejects(
		waitForIceGatheringComplete(peerConnection, undefined, 5),
		(error) => {
			assert.ok(error instanceof VoiceCallSessionError);
			assert.match(error.message, /timed out/i);
			return true;
		}
	);
	assert.equal(listeners.size, 0);
});

function createTrack() {
	return {
		enabled: true,
		stopCalls: 0,
		stop() {
			this.stopCalls += 1;
		}
	};
}

function createHarness({ responseOk = true } = {}) {
	const calls = [];
	const localTrack = createTrack();
	const remoteTrack = createTrack();
	const microphone = {
		getTracks: () => [localTrack],
		getAudioTracks: () => [localTrack]
	};
	let lastPeerConnection;

	class FakePeerConnection {
		constructor() {
			lastPeerConnection = this;
			this.iceGatheringState = 'complete';
			this.connectionState = 'new';
			this.localDescription = null;
			this.listeners = new Map();
			this.dataChannel = {
				closed: false,
				readyState: 'connecting',
				sent: [],
				listeners: new Map(),
				addEventListener: (name, listener) =>
					this.dataChannel.listeners.set(name, listener),
				send: (data) => {
					this.dataChannel.sent.push(data);
				},
				close: () => {
					this.dataChannel.closed = true;
					this.dataChannel.readyState = 'closed';
				}
			};
		}
		addEventListener(name, listener) {
			this.listeners.set(name, listener);
		}
		removeEventListener(name) {
			this.listeners.delete(name);
		}
		addTrack(track) {
			calls.push('addTrack');
			this.senderTrack = track;
		}
		createDataChannel(label) {
			calls.push(`dataChannel:${label}`);
			return this.dataChannel;
		}
		async createOffer() {
			calls.push('createOffer');
			return { type: 'offer', sdp: 'v=0\r\no=browser-offer' };
		}
		async setLocalDescription(offer) {
			this.localDescription = offer;
		}
		async setRemoteDescription(answer) {
			this.remoteDescription = answer;
		}
		getSenders() {
			return [{ track: this.senderTrack }];
		}
		getReceivers() {
			return [{ track: remoteTrack }];
		}
		close() {
			this.closed = true;
		}
	}

	const remoteAudio = {
		srcObject: { getTracks: () => [remoteTrack] },
		pauseCalls: 0,
		pause() {
			this.pauseCalls += 1;
		}
	};
	const requests = [];
	const fetchImpl = async (url, options) => {
		requests.push({ url, options });
		if (!responseOk) {
			return {
				ok: false,
				status: 403,
				json: async () => ({ error: 'Voice calling is unavailable.' })
			};
		}
		return {
			ok: true,
			status: 200,
			text: async () => 'v=0\r\no=server-answer',
			headers: new Headers({
				'X-DocsBot-Voice-Call-Id': 'call-123',
				'X-DocsBot-Conversation-Id': 'conversation-returned'
			})
		};
	};

	return {
		calls,
		localTrack,
		remoteTrack,
		microphone,
		remoteAudio,
		requests,
		fetchImpl,
		FakePeerConnection,
		get lastPeerConnection() {
			return lastPeerConnection;
		}
	};
}

test('request builder uses raw SDP, auth, conversation, and flattened identify metadata headers', () => {
	assert.deepEqual(
		buildVoiceWebrtcRequest({
			apiBase: 'https://api.docsbot.ai',
			teamId: 'team-1',
			botId: 'bot-1',
			conversationId: 'conversation-1',
			authToken: 'private-signature',
			metadata: {
				name: 'Ada',
				email: 'ada@example.com',
				referrer: 'https://example.com/docs',
				priv_stripe_customer_id: 'cus_untrusted'
			},
			sdp: 'v=0'
		}),
		{
			url: 'https://api.docsbot.ai/teams/team-1/bots/bot-1/voice',
			options: {
				method: 'POST',
				headers: {
					'Content-Type': 'application/sdp',
					'X-DocsBot-Conversation-Id': 'conversation-1',
					Authorization: 'Bearer private-signature',
					'X-DocsBot-Metadata': JSON.stringify({
						name: 'Ada',
						email: 'ada@example.com',
						referrer: 'https://example.com/docs'
					})
				},
				body: 'v=0'
			}
		}
	);
});

test('voice public metadata flattens identify.metadata like chat-agent', () => {
	assert.deepEqual(
		buildVoiceWidgetPublicMetadata(
			{
				name: 'Ada',
				metadata: { plan: 'pro' }
			},
			{ referrer: 'https://example.com/page' }
		),
		{
			name: 'Ada',
			plan: 'pro',
			referrer: 'https://example.com/page'
		}
	);
	assert.equal(
		Object.prototype.hasOwnProperty.call(
			buildVoiceWidgetPublicMetadata({ metadata: { plan: 'pro' } }),
			'metadata'
		),
		false
	);
});

test('session negotiates after creating oai-events and cleans every media resource', async () => {
	const harness = createHarness();
	const session = new DocsBotVoiceCallSession({
		apiBase: 'https://api.docsbot.ai',
		teamId: 'team-1',
		botId: 'bot-1',
		conversationId: 'conversation-1',
		authToken: 'private-signature',
		remoteAudio: harness.remoteAudio,
		fetchImpl: harness.fetchImpl,
		RTCPeerConnectionImpl: harness.FakePeerConnection,
		getUserMedia: async () => harness.microphone
	});

	assert.deepEqual(await session.start(), {
		callId: 'call-123',
		conversationId: 'conversation-returned'
	});
	assert.ok(
		harness.calls.indexOf('dataChannel:oai-events') <
			harness.calls.indexOf('createOffer')
	);
	assert.equal(harness.requests.length, 1);
	assert.equal(harness.requests[0].options.body, 'v=0\r\no=browser-offer');

	session.setMuted(true);
	assert.equal(harness.localTrack.enabled, false);
	session.close();
	session.close();
	assert.ok(harness.localTrack.stopCalls >= 1);
	assert.ok(harness.remoteTrack.stopCalls >= 1);
	assert.equal(harness.lastPeerConnection.dataChannel.closed, true);
	assert.equal(harness.lastPeerConnection.closed, true);
	assert.equal(harness.remoteAudio.pauseCalls, 1);
	assert.equal(harness.remoteAudio.srcObject, null);
});

test('sendUserText cancels in-flight speech then injects a user text turn', async () => {
	const harness = createHarness();
	const session = new DocsBotVoiceCallSession({
		apiBase: 'https://api.docsbot.ai',
		teamId: 'team-1',
		botId: 'bot-1',
		remoteAudio: harness.remoteAudio,
		fetchImpl: harness.fetchImpl,
		RTCPeerConnectionImpl: harness.FakePeerConnection,
		getUserMedia: async () => harness.microphone
	});

	await session.start();
	const channel = harness.lastPeerConnection.dataChannel;
	assert.equal(session.sendUserText('  No, thanks  '), false);

	channel.readyState = 'open';
	assert.equal(session.sendUserText('  No, thanks  '), true);
	assert.deepEqual(
		channel.sent.map((raw) => JSON.parse(raw)),
		[
			{ type: 'response.cancel' },
			{
				type: 'conversation.item.create',
				item: {
					type: 'message',
					role: 'user',
					content: [{ type: 'input_text', text: 'No, thanks' }]
				}
			},
			{ type: 'response.create' }
		]
	);

	assert.equal(session.sendUserText(''), false);
	assert.equal(session.sendUserText('   '), false);

	session.close();
	assert.equal(session.sendUserText('Still here?'), false);
});

test('safe API errors propagate without leaving a live peer connection', async () => {
	const harness = createHarness({ responseOk: false });
	const session = new DocsBotVoiceCallSession({
		apiBase: 'https://api.docsbot.ai',
		teamId: 'team-1',
		botId: 'bot-1',
		remoteAudio: harness.remoteAudio,
		fetchImpl: harness.fetchImpl,
		RTCPeerConnectionImpl: harness.FakePeerConnection,
		getUserMedia: async () => harness.microphone
	});

	await assert.rejects(session.start(), (error) => {
		assert.ok(error instanceof VoiceCallSessionError);
		assert.equal(error.status, 403);
		assert.equal(error.message, 'Voice calling is unavailable.');
		return true;
	});
	assert.equal(harness.lastPeerConnection.closed, true);
	assert.ok(harness.localTrack.stopCalls >= 1);
});

test('SDP exchange times out and cleans media resources', async () => {
	const harness = createHarness();
	const fetchImpl = (_url, options) =>
		new Promise((_resolve, reject) => {
			options.signal.addEventListener(
				'abort',
				() =>
					reject(
						new DOMException('Request was aborted.', 'AbortError')
					),
				{ once: true }
			);
		});
	const session = new DocsBotVoiceCallSession({
		apiBase: 'https://api.docsbot.ai',
		teamId: 'team-1',
		botId: 'bot-1',
		remoteAudio: harness.remoteAudio,
		fetchImpl,
		RTCPeerConnectionImpl: harness.FakePeerConnection,
		getUserMedia: async () => harness.microphone,
		setupTimeoutMs: 5
	});

	await assert.rejects(session.start(), (error) => {
		assert.ok(error instanceof VoiceCallSessionError);
		assert.match(error.message, /timed out/i);
		return true;
	});
	assert.equal(harness.lastPeerConnection.closed, true);
	assert.ok(harness.localTrack.stopCalls >= 1);
});
