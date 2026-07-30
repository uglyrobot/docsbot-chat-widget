/** Quiet enough to sit under agent speech, loud enough to notice. */
export const VOICE_TOOL_WORKING_CHIME_VOLUME = 0.25;

/**
 * Looping bed for voice tool-call waits. Must be primed from a user gesture
 * (Start call click) so browsers allow later play() during tool execution.
 */
export function createVoiceToolWorkingChime({
	src,
	volume = VOICE_TOOL_WORKING_CHIME_VOLUME,
	AudioCtor = globalThis.Audio
} = {}) {
	let audio = null;
	let wantPlaying = false;
	let muted = false;
	let unlocked = false;
	let priming = null;

	const ensure = () => {
		if (audio) return audio;
		if (!AudioCtor || !src) return null;
		audio = new AudioCtor(src);
		audio.loop = true;
		audio.preload = 'auto';
		audio.playsInline = true;
		audio.volume = volume;
		audio.muted = muted;
		return audio;
	};

	const syncPlayback = () => {
		const el = ensure();
		if (!el) return;
		el.muted = muted;
		el.volume = volume;
		if (wantPlaying && !muted && unlocked) {
			const playResult = el.play?.();
			if (playResult && typeof playResult.catch === 'function') {
				playResult.catch((error) => {
					if (process.env.NODE_ENV !== 'production') {
						console.warn(
							'DOCSBOT: voice tool working chime play failed',
							error
						);
					}
				});
			}
			return;
		}
		el.pause?.();
		try {
			el.currentTime = 0;
		} catch {
			// Some browsers throw if the media element is not seekable yet.
		}
	};

	return {
		/**
		 * Unlock playback under a user gesture so later tool waits can chime.
		 * Starts `play()` synchronously so autoplay policies accept it.
		 */
		prime() {
			if (unlocked) return Promise.resolve(true);
			// Dedupe concurrent primes (e.g. Start click + mount effect) so a
			// second call's pause() cannot abort the first pending play().
			if (priming) return priming;
			const el = ensure();
			if (!el) return Promise.resolve(false);
			el.muted = true;
			el.volume = 0;
			priming = (async () => {
				try {
					const playResult = el.play?.();
					if (playResult && typeof playResult.then === 'function') {
						await playResult;
					}
					unlocked = true;
				} catch (error) {
					// AbortError means our own pause() interrupted playback —
					// the gesture still unlocked audio, so treat it as success.
					unlocked = error?.name === 'AbortError';
					if (!unlocked && process.env.NODE_ENV !== 'production') {
						console.warn(
							'DOCSBOT: voice tool working chime unlock failed',
							error
						);
					}
				} finally {
					el.pause?.();
					try {
						el.currentTime = 0;
					} catch {
						// Ignore seek races right after unlock.
					}
					el.muted = muted;
					el.volume = volume;
					priming = null;
				}
				syncPlayback();
				return unlocked;
			})();
			return priming;
		},
		setActive(active) {
			wantPlaying = Boolean(active);
			syncPlayback();
		},
		setMuted(nextMuted) {
			muted = Boolean(nextMuted);
			syncPlayback();
		},
		dispose() {
			wantPlaying = false;
			unlocked = false;
			if (!audio) return;
			audio.pause?.();
			try {
				audio.removeAttribute?.('src');
				audio.load?.();
			} catch {
				// Ignore dispose races during unmount.
			}
			audio = null;
		}
	};
}

/** One chime per source so working and searching beds can coexist. */
const sharedChimes = new Map();

/**
 * Shared chime instance so Chatbot can unlock on the Start click gesture
 * before VoiceCallView mounts (mount effects are too late for autoplay).
 */
export function getSharedVoiceToolWorkingChime(src) {
	const key = src || '';
	let chime = sharedChimes.get(key);
	if (!chime) {
		chime = createVoiceToolWorkingChime({ src });
		sharedChimes.set(key, chime);
	}
	return chime;
}

/** Accepts one src or several, so every bed unlocks under the same gesture. */
export function primeSharedVoiceToolWorkingChime(src) {
	const sources = Array.isArray(src) ? src : [src];
	return Promise.all(
		sources.map((entry) => getSharedVoiceToolWorkingChime(entry).prime())
	).then((results) => results.every(Boolean));
}
