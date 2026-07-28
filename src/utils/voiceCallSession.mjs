import { mergeIdentifyMetadata } from './identity.js';

const MAX_SDP_BYTES = 512 * 1024;
const SETUP_TIMEOUT_MS = 15 * 1000;
const MICROPHONE_LEVEL_NOISE_FLOOR = 0.015;
const MICROPHONE_LEVEL_RANGE = 0.16;

export function microphoneLevelFromByteTimeDomain(samples) {
	if (!samples?.length) return 0;

	let squaredSum = 0;
	for (const sample of samples) {
		const centered = (sample - 128) / 128;
		squaredSum += centered * centered;
	}

	const rms = Math.sqrt(squaredSum / samples.length);
	return Math.min(
		1,
		Math.max(
			0,
			(rms - MICROPHONE_LEVEL_NOISE_FLOOR) / MICROPHONE_LEVEL_RANGE
		)
	);
}

export function remoteAudioLevelFromByteTimeDomain(samples) {
	if (!samples?.length) return 0;

	let squaredSum = 0;
	for (const sample of samples) {
		const centered = (sample - 128) / 128;
		squaredSum += centered * centered;
	}

	const rms = Math.sqrt(squaredSum / samples.length);
	return Math.min(1, Math.max(0, rms * 4.5));
}

export class VoiceCallSessionError extends Error {
	constructor(message, { status = 0, code = '' } = {}) {
		super(message);
		this.name = 'VoiceCallSessionError';
		this.status = status;
		this.code = code;
	}
}

async function requestVoiceMicrophone(getUserMedia) {
	const preferred = {
		audio: {
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true
		}
	};
	try {
		return await getUserMedia(preferred);
	} catch (error) {
		if (error?.name === 'OverconstrainedError') {
			return getUserMedia({ audio: true });
		}
		throw error;
	}
}

/**
 * Same flattened identify payload chat-agent sends in the request body.
 * Nested `identify.metadata` is merged to the top level (no nested `metadata` key).
 */
export function buildVoiceWidgetPublicMetadata(
	identify,
	{ referrer } = {}
) {
	const metadata = mergeIdentifyMetadata(identify);
	if (
		referrer !== undefined &&
		!Object.prototype.hasOwnProperty.call(metadata, 'referrer')
	) {
		metadata.referrer = referrer;
	}
	return metadata;
}

export function buildVoiceWebrtcRequest({
	apiBase,
	teamId,
	botId,
	conversationId,
	authToken,
	metadata,
	sdp
}) {
	const headers = { 'Content-Type': 'application/sdp' };
	if (conversationId) {
		headers['X-DocsBot-Conversation-Id'] = conversationId;
	}
	if (authToken) {
		headers.Authorization = `Bearer ${authToken}`;
	}
	if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
		const publicMetadata = Object.fromEntries(
			Object.entries(metadata).filter(
				([key]) => typeof key === 'string' && !key.startsWith('priv_')
			)
		);
		if (Object.keys(publicMetadata).length > 0) {
			headers['X-DocsBot-Metadata'] = JSON.stringify(publicMetadata);
		}
	}
	return {
		url: `${apiBase}/teams/${teamId}/bots/${botId}/voice`,
		options: { method: 'POST', headers, body: sdp }
	};
}

export function sdpByteLength(sdp) {
	if (typeof TextEncoder !== 'undefined') {
		return new TextEncoder().encode(sdp).byteLength;
	}
	return new Blob([sdp]).size;
}

export function waitForIceGatheringComplete(
	peerConnection,
	signal,
	timeoutMs = SETUP_TIMEOUT_MS
) {
	if (peerConnection.iceGatheringState === 'complete') {
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		let timeoutId = null;
		const cleanup = () => {
			if (timeoutId !== null) {
				globalThis.clearTimeout(timeoutId);
				timeoutId = null;
			}
			peerConnection.removeEventListener(
				'icegatheringstatechange',
				handleStateChange
			);
			signal?.removeEventListener('abort', handleAbort);
		};
		const handleStateChange = () => {
			if (peerConnection.iceGatheringState !== 'complete') return;
			cleanup();
			resolve();
		};
		const handleAbort = () => {
			cleanup();
			reject(
				new DOMException(
					'Voice call setup was cancelled.',
					'AbortError'
				)
			);
		};
		const handleTimeout = () => {
			cleanup();
			reject(
				new VoiceCallSessionError(
					'Voice call setup timed out. Please try again.'
				)
			);
		};

		peerConnection.addEventListener(
			'icegatheringstatechange',
			handleStateChange
		);
		signal?.addEventListener('abort', handleAbort, { once: true });
		timeoutId = globalThis.setTimeout(
			handleTimeout,
			Math.max(1, timeoutMs)
		);
	});
}

async function fetchVoiceAnswerWithTimeout(
	fetchImpl,
	url,
	options,
	{ signal, timeoutMs = SETUP_TIMEOUT_MS } = {}
) {
	if (signal?.aborted) {
		throw new DOMException('Voice call setup was cancelled.', 'AbortError');
	}

	const controller = new AbortController();
	let timedOut = false;
	const handleAbort = () => controller.abort();
	signal?.addEventListener('abort', handleAbort, { once: true });
	const timeoutId = globalThis.setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, Math.max(1, timeoutMs));

	try {
		return await fetchImpl(url, {
			...options,
			signal: controller.signal
		});
	} catch (error) {
		if (timedOut && !signal?.aborted) {
			throw new VoiceCallSessionError(
				'Voice call setup timed out. Please try again.'
			);
		}
		throw error;
	} finally {
		globalThis.clearTimeout(timeoutId);
		signal?.removeEventListener('abort', handleAbort);
	}
}

async function readVoiceError(response) {
	try {
		const body = await response.json();
		if (typeof body?.error === 'string' && body.error.trim()) {
			return body.error.trim();
		}
	} catch {
		// Non-JSON proxy errors intentionally fall through to the safe fallback.
	}
	return 'Could not start voice conversation.';
}

function defaultFetchImpl(url, options) {
	return globalThis.fetch(url, options);
}

export class DocsBotVoiceCallSession {
	constructor({
		apiBase,
		teamId,
		botId,
		conversationId,
		authToken,
		metadata,
		remoteAudio,
		fetchImpl = defaultFetchImpl,
		RTCPeerConnectionImpl = globalThis.RTCPeerConnection,
		getUserMedia = (constraints) =>
			globalThis.navigator.mediaDevices.getUserMedia(constraints),
		AudioContextImpl = globalThis.AudioContext ||
			globalThis.webkitAudioContext,
		setupTimeoutMs = SETUP_TIMEOUT_MS,
		onRealtimeEvent = () => {},
		onConnectionState = () => {},
		onMicrophoneLevel = () => {},
		onOutputLevel = () => {}
	}) {
		this.config = {
			apiBase,
			teamId,
			botId,
			conversationId,
			authToken,
			metadata
		};
		this.remoteAudio = remoteAudio;
		this.fetchImpl = fetchImpl;
		this.RTCPeerConnectionImpl = RTCPeerConnectionImpl;
		this.getUserMedia = getUserMedia;
		this.AudioContextImpl = AudioContextImpl;
		this.setupTimeoutMs = setupTimeoutMs;
		this.onRealtimeEvent = onRealtimeEvent;
		this.onConnectionState = onConnectionState;
		this.onMicrophoneLevel = onMicrophoneLevel;
		this.onOutputLevel = onOutputLevel;
		this.peerConnection = null;
		this.dataChannel = null;
		this.microphone = null;
		this.remoteTracks = new Set();
		this.audioContext = null;
		this.microphoneSource = null;
		this.microphoneAnalyser = null;
		this.microphoneLevelFrame = 0;
		this.microphoneLevel = 0;
		this.remoteAudioContext = null;
		this.remoteAudioSource = null;
		this.remoteAudioAnalyser = null;
		this.remoteAudioLevelFrame = 0;
		this.remoteAudioLevel = 0;
		this.setupController = null;
		this.callId = null;
		this.conversationId = conversationId || null;
		this.closed = false;
	}

	startMicrophoneLevelMeter() {
		if (!this.AudioContextImpl || !this.microphone) return;

		try {
			const audioContext = new this.AudioContextImpl();
			const analyser = audioContext.createAnalyser();
			analyser.fftSize = 512;
			analyser.smoothingTimeConstant = 0.78;
			const source = audioContext.createMediaStreamSource(
				this.microphone
			);
			source.connect(analyser);
			this.audioContext = audioContext;
			this.microphoneSource = source;
			this.microphoneAnalyser = analyser;
			const samples = new Uint8Array(analyser.fftSize);
			let lastReportAt = 0;

			void audioContext.resume?.().catch?.(() => {});
			const sample = (time) => {
				if (this.closed || this.microphoneAnalyser !== analyser) return;
				analyser.getByteTimeDomainData(samples);
				const rawLevel = microphoneLevelFromByteTimeDomain(samples);
				this.microphoneLevel =
					this.microphoneLevel * 0.76 + rawLevel * 0.24;
				if (time - lastReportAt >= 33) {
					lastReportAt = time;
					this.onMicrophoneLevel(this.microphoneLevel);
				}
				this.microphoneLevelFrame =
					globalThis.requestAnimationFrame(sample);
			};
			this.microphoneLevelFrame =
				globalThis.requestAnimationFrame(sample);
		} catch {
			// Metering is cosmetic; it must never prevent a voice call from starting.
			this.stopMicrophoneLevelMeter();
		}
	}

	stopMicrophoneLevelMeter() {
		if (this.microphoneLevelFrame) {
			globalThis.cancelAnimationFrame?.(this.microphoneLevelFrame);
		}
		this.microphoneLevelFrame = 0;
		this.microphoneLevel = 0;
		this.onMicrophoneLevel(0);

		try {
			this.microphoneSource?.disconnect();
			this.microphoneAnalyser?.disconnect();
			void this.audioContext?.close?.().catch?.(() => {});
		} catch {
			// Browser audio resources may already be closed.
		}
		this.microphoneSource = null;
		this.microphoneAnalyser = null;
		this.audioContext = null;
	}

	startOutputLevelMeter(remoteStream) {
		this.stopOutputLevelMeter();
		if (!this.AudioContextImpl || !remoteStream) return;

		try {
			const audioContext = new this.AudioContextImpl();
			const analyser = audioContext.createAnalyser();
			analyser.fftSize = 256;
			analyser.smoothingTimeConstant = 0.72;
			const source = audioContext.createMediaStreamSource(remoteStream);
			source.connect(analyser);
			this.remoteAudioContext = audioContext;
			this.remoteAudioSource = source;
			this.remoteAudioAnalyser = analyser;
			const samples = new Uint8Array(analyser.fftSize);
			let lastReportAt = 0;

			void audioContext.resume?.().catch?.(() => {});
			const sample = (time) => {
				if (this.closed || this.remoteAudioAnalyser !== analyser) return;
				analyser.getByteTimeDomainData(samples);
				const rawLevel = remoteAudioLevelFromByteTimeDomain(samples);
				this.remoteAudioLevel =
					this.remoteAudioLevel * 0.68 + rawLevel * 0.32;
				if (time - lastReportAt >= 33) {
					lastReportAt = time;
					this.onOutputLevel(this.remoteAudioLevel);
				}
				this.remoteAudioLevelFrame =
					globalThis.requestAnimationFrame(sample);
			};
			this.remoteAudioLevelFrame = globalThis.requestAnimationFrame(sample);
		} catch {
			// Metering is cosmetic; remote audio must continue even if it is unavailable.
			this.stopOutputLevelMeter();
		}
	}

	stopOutputLevelMeter() {
		if (this.remoteAudioLevelFrame) {
			globalThis.cancelAnimationFrame?.(this.remoteAudioLevelFrame);
		}
		this.remoteAudioLevelFrame = 0;
		this.remoteAudioLevel = 0;
		this.onOutputLevel(0);

		try {
			this.remoteAudioSource?.disconnect();
			this.remoteAudioAnalyser?.disconnect();
			void this.remoteAudioContext?.close?.().catch?.(() => {});
		} catch {
			// Browser audio resources may already be closed.
		}
		this.remoteAudioSource = null;
		this.remoteAudioAnalyser = null;
		this.remoteAudioContext = null;
	}

	async start() {
		if (!this.RTCPeerConnectionImpl) {
			throw new VoiceCallSessionError(
				'Voice calls are not supported in this browser.'
			);
		}
		this.closed = false;
		this.setupController = new AbortController();
		const signal = this.setupController.signal;
		const pc = new this.RTCPeerConnectionImpl();
		this.peerConnection = pc;

		pc.addEventListener('connectionstatechange', () => {
			if (!this.closed) this.onConnectionState(pc.connectionState);
		});
		pc.addEventListener('track', (event) => {
			if (event.track) this.remoteTracks.add(event.track);
			const remoteStream = event.streams?.[0] || null;
			if (remoteStream) this.startOutputLevelMeter(remoteStream);
			if (!this.remoteAudio || !remoteStream) return;
			this.remoteAudio.srcObject = remoteStream;
			void this.remoteAudio.play?.().catch?.(() => {});
		});

		try {
			this.microphone = await requestVoiceMicrophone(this.getUserMedia);
			if (signal.aborted)
				throw new DOMException('Cancelled', 'AbortError');
			this.startMicrophoneLevelMeter();

			for (const track of this.microphone.getTracks()) {
				pc.addTrack(track, this.microphone);
			}

			const events = pc.createDataChannel('oai-events');
			this.dataChannel = events;
			events.addEventListener('open', () => {
				if (!this.closed) this.onConnectionState('connected');
			});
			events.addEventListener('close', () => {
				if (!this.closed) this.onConnectionState('closed');
			});
			events.addEventListener('message', (messageEvent) => {
				try {
					const event = JSON.parse(messageEvent.data);
					if (event && typeof event.type === 'string') {
						this.onRealtimeEvent(event);
					}
				} catch {
					// Ignore malformed server events without exposing their raw contents.
				}
			});

			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);
			await waitForIceGatheringComplete(
				pc,
				signal,
				this.setupTimeoutMs
			);
			const sdp = pc.localDescription?.sdp || '';
			if (!sdp) {
				throw new VoiceCallSessionError(
					'The browser did not create a voice connection offer.'
				);
			}
			if (sdpByteLength(sdp) > MAX_SDP_BYTES) {
				throw new VoiceCallSessionError(
					'The voice connection offer is too large.'
				);
			}

			const request = buildVoiceWebrtcRequest({ ...this.config, sdp });
			if (process.env.NODE_ENV !== 'production') {
				console.info('DOCSBOT: posting voice SDP offer to', request.url);
			}
			const response = await fetchVoiceAnswerWithTimeout(
				this.fetchImpl,
				request.url,
				request.options,
				{ signal, timeoutMs: this.setupTimeoutMs }
			);
			if (!response.ok) {
				throw new VoiceCallSessionError(
					await readVoiceError(response),
					{
						status: response.status
					}
				);
			}

			const answerSdp = await response.text();
			if (!answerSdp.trim()) {
				throw new VoiceCallSessionError(
					'The voice service returned an empty answer.'
				);
			}
			await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
			this.callId = response.headers.get('X-DocsBot-Voice-Call-Id');
			this.conversationId =
				response.headers.get('X-DocsBot-Conversation-Id') ||
				this.config.conversationId ||
				null;

			return {
				callId: this.callId,
				conversationId: this.conversationId
			};
		} catch (error) {
			this.close();
			throw error;
		}
	}

	setMuted(muted) {
		for (const track of this.microphone?.getAudioTracks?.() || []) {
			track.enabled = !muted;
		}
		if (muted) this.onMicrophoneLevel(0);
	}

	/**
	 * Inject a text user turn into the live Realtime session and request a
	 * response. Used for UI actions (e.g. declining support escalation).
	 * @returns {boolean} true if events were sent on an open data channel
	 */
	sendUserText(text) {
		const trimmed = typeof text === 'string' ? text.trim() : '';
		if (!trimmed) return false;
		if (this.closed) return false;
		const channel = this.dataChannel;
		if (!channel || channel.readyState !== 'open') return false;
		if (typeof channel.send !== 'function') return false;

		const sendEvent = (event) => {
			channel.send(JSON.stringify(event));
		};

		try {
			// Best-effort: stop in-flight agent speech before the decline turn.
			try {
				sendEvent({ type: 'response.cancel' });
			} catch {
				// Cancel may fail if no response is active; continue.
			}
			sendEvent({
				type: 'conversation.item.create',
				item: {
					type: 'message',
					role: 'user',
					content: [{ type: 'input_text', text: trimmed }]
				}
			});
			sendEvent({ type: 'response.create' });
			return true;
		} catch {
			return false;
		}
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.setupController?.abort();
		this.setupController = null;
		this.stopMicrophoneLevelMeter();
		this.stopOutputLevelMeter();

		for (const track of this.microphone?.getTracks?.() || []) {
			track.stop();
		}
		this.microphone = null;

		for (const sender of this.peerConnection?.getSenders?.() || []) {
			sender.track?.stop?.();
		}
		for (const receiver of this.peerConnection?.getReceivers?.() || []) {
			receiver.track?.stop?.();
		}
		for (const track of this.remoteTracks) {
			track.stop?.();
		}
		this.remoteTracks.clear();

		try {
			this.dataChannel?.close();
		} catch {
			// Already closed.
		}
		this.dataChannel = null;

		try {
			this.peerConnection?.close();
		} catch {
			// Already closed.
		}
		this.peerConnection = null;

		if (this.remoteAudio) {
			this.remoteAudio.pause?.();
			this.remoteAudio.srcObject = null;
		}
	}
}

export const VOICE_MAX_SDP_BYTES = MAX_SDP_BYTES;
export const VOICE_SETUP_TIMEOUT_MS = SETUP_TIMEOUT_MS;
