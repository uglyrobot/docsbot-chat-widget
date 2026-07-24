import { useEffect, useRef, useState } from 'react';
import { MODE_DRAWS, resolvePreset } from 'thinking-orbs';
import { VOICE_CALL_STATUS } from '../../utils/voiceRealtimeState.mjs';

const ORB_PRESENTATION = {
	[VOICE_CALL_STATUS.CONNECTING]: { orbState: 'working', speed: 0.68 },
	[VOICE_CALL_STATUS.LISTENING]: { orbState: 'working', speed: 0.72 },
	[VOICE_CALL_STATUS.USER_SPEAKING]: { orbState: 'listening', speed: 1.25 },
	[VOICE_CALL_STATUS.THINKING]: { orbState: 'solving', speed: 0.9 },
	[VOICE_CALL_STATUS.USING_TOOL]: { orbState: 'searching', speed: 1.05 },
	[VOICE_CALL_STATUS.AGENT_SPEAKING]: { orbState: 'composing', speed: 1.35 },
	[VOICE_CALL_STATUS.ERROR]: {
		orbState: 'shaping',
		speed: 0.12,
		color: '#dc2626'
	},
	[VOICE_CALL_STATUS.ENDED]: {
		orbState: 'shaping',
		speed: 0.12,
		color: '#64748b'
	}
};

function usePrefersReducedMotion() {
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
		if (!query) return;
		setReduced(query.matches);
		const handleChange = (event) => setReduced(event.matches);
		query.addEventListener?.('change', handleChange);
		return () => query.removeEventListener?.('change', handleChange);
	}, []);
	return reduced;
}

/**
 * Brand-tinted adaptation of Jakub Antalik's MIT-licensed `thinking-orbs`
 * Canvas 2D engine. Used for the large call-stage orb and the compact
 * composer start-call control.
 */
export function VoiceOrb({
	status,
	color,
	label,
	audioLevel = 0,
	size = 184,
	compact = false,
	speed
}) {
	const canvasRef = useRef(null);
	const colorRef = useRef(null);
	const speedRef = useRef(null);
	const reducedMotion = usePrefersReducedMotion();
	const presentation =
		ORB_PRESENTATION[status] ||
		ORB_PRESENTATION[VOICE_CALL_STATUS.CONNECTING];
	const orbColor = color || presentation.color || '#1292ee';
	// Prefer at least the official 20px small preset density.
	const paintSize = Math.max(20, Math.round(size));
	const motionSpeed =
		typeof speed === 'number' ? speed : presentation.speed;
	colorRef.current = orbColor;
	speedRef.current = motionSpeed;
	const speakingLevel =
		status === VOICE_CALL_STATUS.USER_SPEAKING ||
		status === VOICE_CALL_STATUS.AGENT_SPEAKING
			? Math.min(1, Math.max(0, audioLevel))
			: 0;
	const amplitudeScale = reducedMotion ? 1 : 1 + speakingLevel * 0.16;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = Math.round(paintSize * dpr);
		canvas.height = Math.round(paintSize * dpr);
		const context = canvas.getContext('2d');
		if (!context) return;

		// thinking-orbs only ships density presets for 20 and 64.
		const preset = resolvePreset(presentation.orbState, compact ? 20 : 64);
		const draw = MODE_DRAWS[preset.mode];
		const paintFrame = (timeSeconds) => {
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			context.clearRect(0, 0, paintSize, paintSize);
			draw(context, paintSize, timeSeconds, false, preset.opts);
			context.save();
			context.globalCompositeOperation = 'source-atop';
			context.globalAlpha = 0.82;
			context.fillStyle = colorRef.current || '#1292ee';
			context.fillRect(0, 0, paintSize, paintSize);
			context.restore();
		};

		if (reducedMotion || speedRef.current === 0) {
			paintFrame(0.6);
			return;
		}

		let animationFrame = 0;
		let running = false;
		let visible = true;
		let lastFrameMs = performance.now();
		let elapsedSeconds = 0;
		const loop = () => {
			const now = performance.now();
			const deltaSeconds = Math.min(0.05, (now - lastFrameMs) / 1000);
			lastFrameMs = now;
			elapsedSeconds +=
				deltaSeconds * preset.speed * (speedRef.current || 0);
			paintFrame(elapsedSeconds);
			if (running) animationFrame = window.requestAnimationFrame(loop);
		};
		const start = () => {
			if (running || !visible || document.visibilityState === 'hidden')
				return;
			running = true;
			lastFrameMs = performance.now();
			animationFrame = window.requestAnimationFrame(loop);
		};
		const stop = () => {
			running = false;
			window.cancelAnimationFrame(animationFrame);
		};
		const observer =
			typeof IntersectionObserver !== 'undefined'
				? new IntersectionObserver(([entry]) => {
						visible = entry.isIntersecting;
						if (visible) start();
						else stop();
					})
				: null;
		observer?.observe(canvas);
		const handleVisibility = () => {
			if (document.visibilityState === 'hidden') stop();
			else start();
		};
		document.addEventListener('visibilitychange', handleVisibility);
		paintFrame(0.6);
		if (!observer) start();

		return () => {
			stop();
			observer?.disconnect();
			document.removeEventListener('visibilitychange', handleVisibility);
		};
	}, [compact, paintSize, presentation, reducedMotion]);

	return (
		<div
			className={`docsbot-voice-orb-shell is-${status}${compact ? ' is-compact' : ''}`}
			style={{
				'--docsbot-voice-orb-color': orbColor,
				'--docsbot-voice-orb-scale': amplitudeScale,
				...(compact
					? {
							'--docsbot-voice-orb-size': `${paintSize}px`
						}
					: null)
			}}
		>
			<canvas
				ref={canvasRef}
				className="docsbot-voice-orb"
				role="img"
				aria-label={label}
				aria-hidden={label ? undefined : true}
			/>
		</div>
	);
}
