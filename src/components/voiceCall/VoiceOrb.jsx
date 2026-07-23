import { useEffect, useRef, useState } from 'react';
import { MODE_DRAWS, resolvePreset } from 'thinking-orbs';
import { VOICE_CALL_STATUS } from '../../utils/voiceRealtimeState.mjs';

const ORB_PRESENTATION = {
	[VOICE_CALL_STATUS.CONNECTING]: { orbState: 'working', speed: 0.68 },
	[VOICE_CALL_STATUS.LISTENING]: { orbState: 'listening', speed: 0.72 },
	[VOICE_CALL_STATUS.USER_SPEAKING]: { orbState: 'composing', speed: 1.25 },
	[VOICE_CALL_STATUS.THINKING]: { orbState: 'solving', speed: 0.9 },
	[VOICE_CALL_STATUS.USING_TOOL]: { orbState: 'searching', speed: 1.05 },
	[VOICE_CALL_STATUS.AGENT_SPEAKING]: { orbState: 'listening', speed: 1.35 },
	[VOICE_CALL_STATUS.ERROR]: {
		orbState: 'shaping',
		speed: 0,
		color: '#dc2626'
	},
	[VOICE_CALL_STATUS.ENDED]: {
		orbState: 'shaping',
		speed: 0,
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
 * Large, brand-tinted adaptation of Jakub Antalik's MIT-licensed
 * `thinking-orbs` Canvas 2D engine. The package's raw painter API is used so
 * this remains faithful to the source while supporting the widget's larger
 * voice-call presentation and brand palette.
 */
export function VoiceOrb({ status, color, label, audioLevel = 0 }) {
	const canvasRef = useRef(null);
	const reducedMotion = usePrefersReducedMotion();
	const presentation =
		ORB_PRESENTATION[status] ||
		ORB_PRESENTATION[VOICE_CALL_STATUS.CONNECTING];
	const orbColor = presentation.color || color || '#1292ee';
	const speakingLevel =
		status === VOICE_CALL_STATUS.USER_SPEAKING ||
		status === VOICE_CALL_STATUS.AGENT_SPEAKING
			? Math.min(1, Math.max(0, audioLevel))
			: 0;
	const amplitudeScale = reducedMotion ? 1 : 1 + speakingLevel * 0.16;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const size = 184;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = Math.round(size * dpr);
		canvas.height = Math.round(size * dpr);
		const context = canvas.getContext('2d');
		if (!context) return;

		const preset = resolvePreset(presentation.orbState, 64);
		const draw = MODE_DRAWS[preset.mode];
		const effectiveSpeed = preset.speed * presentation.speed;
		const paintFrame = (timeSeconds) => {
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			context.clearRect(0, 0, size, size);
			draw(context, size, timeSeconds, false, preset.opts);
			context.save();
			context.globalCompositeOperation = 'source-atop';
			context.globalAlpha = 0.82;
			context.fillStyle = orbColor;
			context.fillRect(0, 0, size, size);
			context.restore();
		};

		if (reducedMotion || presentation.speed === 0) {
			paintFrame(0.6);
			return;
		}

		let animationFrame = 0;
		let running = false;
		let visible = true;
		const loop = () => {
			paintFrame((performance.now() / 1000) * effectiveSpeed);
			if (running) animationFrame = window.requestAnimationFrame(loop);
		};
		const start = () => {
			if (running || !visible || document.visibilityState === 'hidden')
				return;
			running = true;
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
		paintFrame((performance.now() / 1000) * effectiveSpeed);
		if (!observer) start();

		return () => {
			stop();
			observer?.disconnect();
			document.removeEventListener('visibilitychange', handleVisibility);
		};
	}, [orbColor, presentation, reducedMotion]);

	return (
		<div
			className={`docsbot-voice-orb-shell is-${status}`}
			style={{
				'--docsbot-voice-orb-color': orbColor,
				'--docsbot-voice-orb-scale': amplitudeScale
			}}
		>
			<canvas
				ref={canvasRef}
				className="docsbot-voice-orb"
				role="img"
				aria-label={label}
			/>
		</div>
	);
}
