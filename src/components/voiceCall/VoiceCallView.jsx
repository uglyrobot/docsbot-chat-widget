import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
	faArrowLeft,
	faMicrophone,
	faMicrophoneSlash,
	faPhoneSlash,
	faRotateRight
} from '@fortawesome/free-solid-svg-icons';
import { agentActivityFromSseEvent } from '../../utils/agentActivityFromSse';
import {
	DocsBotVoiceCallSession,
	VoiceCallSessionError
} from '../../utils/voiceCallSession.mjs';
import {
	VOICE_CALL_STATUS,
	createVoiceRealtimeState,
	finalVoiceTranscriptFromEvent,
	orderedVoiceTranscripts,
	reduceVoiceRealtimeEvent,
	voiceToolNameFromEvent
} from '../../utils/voiceRealtimeState.mjs';
import { AgentActivityStatus } from '../botChatMessage/BotChatMessage';
import { VoiceOrb } from './VoiceOrb';

const STATUS_LABEL_KEYS = {
	[VOICE_CALL_STATUS.CONNECTING]: 'voiceCallConnecting',
	[VOICE_CALL_STATUS.LISTENING]: 'voiceCallListening',
	[VOICE_CALL_STATUS.USER_SPEAKING]: 'voiceCallUserSpeaking',
	[VOICE_CALL_STATUS.THINKING]: 'agentActivityThinking',
	[VOICE_CALL_STATUS.USING_TOOL]: 'agentActivityTool',
	[VOICE_CALL_STATUS.AGENT_SPEAKING]: 'voiceCallAgentSpeaking',
	[VOICE_CALL_STATUS.ERROR]: 'voiceCallError',
	[VOICE_CALL_STATUS.ENDED]: 'voiceCallEnded'
};

function safeConnectionError(error, labels) {
	if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
		return labels.audioMicrophoneError;
	}
	if (error instanceof VoiceCallSessionError && error.message) {
		return error.message;
	}
	return labels.voiceCallError;
}

export function VoiceCallView({
	apiBase,
	teamId,
	botId,
	conversationId,
	signature,
	labels,
	color,
	showAgentActivity,
	onConversationId,
	onTranscriptFinal,
	onExit
}) {
	const remoteAudioRef = useRef(null);
	const sessionRef = useRef(null);
	const transcriptListRef = useRef(null);
	const attemptRef = useRef(0);
	const [voiceState, setVoiceState] = useState(createVoiceRealtimeState);
	const [agentActivity, setAgentActivity] = useState(null);
	const [errorDetail, setErrorDetail] = useState('');
	const [isMuted, setIsMuted] = useState(false);
	const [outputLevel, setOutputLevel] = useState(0);
	const [waveformLevels, setWaveformLevels] = useState(() =>
		Array(32).fill(0.04)
	);

	const cleanupSession = useCallback(() => {
		attemptRef.current += 1;
		sessionRef.current?.close();
		sessionRef.current = null;
	}, []);

	const handleRealtimeEvent = useCallback(
		(event) => {
			setVoiceState((current) =>
				reduceVoiceRealtimeEvent(current, event)
			);
			const toolName = voiceToolNameFromEvent(event);
			if (toolName) {
				setAgentActivity(
					agentActivityFromSseEvent('tool_call', {
						name: toolName,
						params: ''
					})
				);
			} else if (
				event.type === 'response.done' ||
				event.type === 'error'
			) {
				setAgentActivity(null);
			}

			const finalTranscript = finalVoiceTranscriptFromEvent(event);
			if (finalTranscript) onTranscriptFinal(finalTranscript);
		},
		[onTranscriptFinal]
	);

	const startCall = useCallback(async () => {
		cleanupSession();
		const attempt = ++attemptRef.current;
		setVoiceState(createVoiceRealtimeState());
		setAgentActivity(null);
		setErrorDetail('');
		setIsMuted(false);
		setOutputLevel(0);
		setWaveformLevels(Array(32).fill(0.04));

		const session = new DocsBotVoiceCallSession({
			apiBase,
			teamId,
			botId,
			conversationId,
			authToken: signature,
			remoteAudio: remoteAudioRef.current,
			onRealtimeEvent: handleRealtimeEvent,
			onMicrophoneLevel: (level) => {
				if (attempt !== attemptRef.current) return;
				setWaveformLevels((previous) => [
					...previous.slice(1),
					Math.max(0.04, level)
				]);
			},
			onOutputLevel: (level) => {
				if (attempt !== attemptRef.current) return;
				setOutputLevel(level);
			},
			onConnectionState: (connectionState) => {
				if (attempt !== attemptRef.current) return;
				if (connectionState === 'connected') {
					setVoiceState((current) => ({
						...current,
						status: VOICE_CALL_STATUS.LISTENING,
						error: false
					}));
				} else if (
					connectionState === 'failed' ||
					connectionState === 'disconnected'
				) {
					setErrorDetail(labels.voiceCallError);
					setVoiceState((current) => ({
						...current,
						status: VOICE_CALL_STATUS.ERROR,
						error: true
					}));
				} else if (connectionState === 'closed') {
					setVoiceState((current) => ({
						...current,
						status: VOICE_CALL_STATUS.ENDED
					}));
				}
			}
		});
		sessionRef.current = session;

		try {
			const metadata = await session.start();
			if (attempt !== attemptRef.current) return;
			if (metadata.conversationId)
				onConversationId(metadata.conversationId);
		} catch (error) {
			if (attempt !== attemptRef.current || error?.name === 'AbortError')
				return;
			setErrorDetail(safeConnectionError(error, labels));
			setVoiceState((current) => ({
				...current,
				status: VOICE_CALL_STATUS.ERROR,
				error: true
			}));
		}
	}, [
		apiBase,
		botId,
		cleanupSession,
		conversationId,
		handleRealtimeEvent,
		labels,
		onConversationId,
		signature,
		teamId
	]);

	useEffect(() => {
		void startCall();
		const handlePageHide = () => cleanupSession();
		window.addEventListener('pagehide', handlePageHide);
		return () => {
			window.removeEventListener('pagehide', handlePageHide);
			cleanupSession();
		};
	}, []);

	const transcripts = orderedVoiceTranscripts(voiceState);
	const modelAudioLevel =
		voiceState.status === VOICE_CALL_STATUS.AGENT_SPEAKING
			? outputLevel
			: 0;
	useEffect(() => {
		const list = transcriptListRef.current;
		if (list) list.scrollTop = list.scrollHeight;
	}, [transcripts]);

	const statusLabel = labels[STATUS_LABEL_KEYS[voiceState.status]];
	const endCall = () => {
		cleanupSession();
		setAgentActivity(null);
		setVoiceState((current) => ({
			...current,
			status: VOICE_CALL_STATUS.ENDED,
			activeToolName: ''
		}));
	};
	const leaveCall = () => {
		cleanupSession();
		onExit();
	};
	const toggleMute = () => {
		const nextMuted = !isMuted;
		sessionRef.current?.setMuted(nextMuted);
		setIsMuted(nextMuted);
	};

	return (
		<div
			className="docsbot-voice-call-view"
			data-voice-status={voiceState.status}
		>
			{/* Live WebRTC audio is captioned separately in the transcript log below. */}
			{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
			<audio
				ref={remoteAudioRef}
				autoPlay
				className="docsbot-voice-remote-audio"
			/>
			<div className="docsbot-voice-call-topbar">
				<button
					type="button"
					className="docsbot-voice-call-back"
					onClick={leaveCall}
					aria-label={labels.voiceCallReturn}
				>
					<FontAwesomeIcon icon={faArrowLeft} />
					<span>{labels.voiceCallReturn}</span>
				</button>
			</div>

			<div className="docsbot-voice-call-stage">
				<VoiceOrb
					status={voiceState.status}
					color={color}
					label={statusLabel}
					audioLevel={modelAudioLevel}
				/>
				<div
					className="docsbot-voice-call-status"
					role="status"
					aria-live="polite"
				>
					{statusLabel}
				</div>
				{voiceState.status === VOICE_CALL_STATUS.ERROR &&
				errorDetail ? (
					<p className="docsbot-voice-call-error" role="alert">
						{errorDetail}
					</p>
				) : null}
				{showAgentActivity !== false && agentActivity ? (
					<AgentActivityStatus
						agentActivity={agentActivity}
						labels={labels}
					/>
				) : null}
			</div>

			<div
				ref={transcriptListRef}
				className="docsbot-voice-transcripts"
				role="log"
				aria-live="polite"
				aria-label={labels.voiceCallTranscript}
			>
				{transcripts.map((entry) => (
					<div
						key={entry.itemId}
						className={`docsbot-voice-transcript is-${entry.role}`}
					>
						<span className="docsbot-screen-reader-only">
							{entry.role === 'caller'
								? `${labels.voiceCallCaller}: `
								: `${labels.voiceCallAgent}: `}
						</span>
						<span dir="auto">{entry.text}</span>
					</div>
				))}
			</div>

			<div className="docsbot-voice-call-controls">
				{voiceState.status === VOICE_CALL_STATUS.ERROR ? (
					<button
						type="button"
						className="docsbot-voice-control is-secondary"
						onClick={() => void startCall()}
					>
						<FontAwesomeIcon icon={faRotateRight} />
						<span>{labels.voiceCallRetry}</span>
					</button>
				) : voiceState.status === VOICE_CALL_STATUS.ENDED ? (
					<button
						type="button"
						className="docsbot-voice-control is-secondary"
						onClick={leaveCall}
					>
						<FontAwesomeIcon icon={faArrowLeft} />
						<span>{labels.voiceCallReturn}</span>
					</button>
				) : (
					<div
						className="docsbot-voice-call-input"
						role="group"
						aria-label={labels.voiceCallListening}
					>
						<div
							className="docsbot-voice-call-wave"
							aria-hidden="true"
						>
							{waveformLevels.map((level, index) => (
								<span
									key={index}
									style={{
										height: `${Math.round(2 + level * 18)}px`,
										opacity: 0.42 + level * 0.5
									}}
								/>
							))}
						</div>
						<button
							type="button"
							className={`docsbot-voice-control is-mute ${isMuted ? 'is-active' : ''}`}
							onClick={toggleMute}
							aria-pressed={isMuted}
							aria-label={
								isMuted
									? labels.voiceCallUnmute
									: labels.voiceCallMute
							}
						>
							<FontAwesomeIcon
								icon={
									isMuted ? faMicrophoneSlash : faMicrophone
								}
							/>
							<span className="docsbot-screen-reader-only">
								{isMuted
									? labels.voiceCallUnmute
									: labels.voiceCallMute}
							</span>
						</button>
						<button
							type="button"
							className="docsbot-voice-control is-end"
							onClick={endCall}
						>
							<FontAwesomeIcon icon={faPhoneSlash} />
							<span className="docsbot-screen-reader-only">
								{labels.voiceCallEnd}
							</span>
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
