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
	VoiceCallSessionError,
	buildVoiceWidgetPublicMetadata
} from '../../utils/voiceCallSession.mjs';
import { interleaveVoiceLiveItems } from '../../utils/voiceCallHistory.mjs';
import {
	VOICE_CALL_STATUS,
	createVoiceRealtimeState,
	finalVoiceTranscriptFromEvent,
	orderedVoiceTranscripts,
	reduceVoiceRealtimeEvent,
	voiceClientActionFromEvent,
	voiceToolNameFromEvent
} from '../../utils/voiceRealtimeState.mjs';
import {
	AgentActivityStatus,
	BotChatMessage
} from '../botChatMessage/BotChatMessage';
import { VoiceOrb } from './VoiceOrb';

function renderHistoryTranscript(entry, labels) {
	return (
		<div
			key={`history-${entry.id}`}
			className={`docsbot-voice-transcript is-${entry.role} is-history`}
		>
			<span className="docsbot-screen-reader-only">
				{entry.role === 'caller'
					? `${labels.voiceCallCaller}: `
					: `${labels.voiceCallAgent}: `}
			</span>
			<span dir="auto">{entry.text}</span>
		</div>
	);
}

const STATUS_LABEL_KEYS = {
	[VOICE_CALL_STATUS.CONNECTING]: 'voiceCallConnecting',
	[VOICE_CALL_STATUS.LISTENING]: 'voiceCallListening',
	[VOICE_CALL_STATUS.THINKING]: 'agentActivityThinking',
	[VOICE_CALL_STATUS.USING_TOOL]: 'agentActivityTool',
	[VOICE_CALL_STATUS.ERROR]: 'voiceCallError',
	[VOICE_CALL_STATUS.ENDED]: 'voiceCallEnded'
};

// Idle listening: aria on the orb only. Speaking: no status copy at all.
const STATUS_LABEL_VISIBLE_HIDDEN = new Set([
	VOICE_CALL_STATUS.LISTENING,
	VOICE_CALL_STATUS.USER_SPEAKING,
	VOICE_CALL_STATUS.AGENT_SPEAKING
]);
const STATUS_LABEL_ARIA_HIDDEN = new Set([
	VOICE_CALL_STATUS.USER_SPEAKING,
	VOICE_CALL_STATUS.AGENT_SPEAKING
]);

function safeConnectionError(error, labels) {
	if (
		error?.name === 'NotAllowedError' ||
		error?.name === 'SecurityError' ||
		error?.name === 'NotFoundError' ||
		error?.name === 'NotReadableError' ||
		error?.name === 'OverconstrainedError'
	) {
		return labels.audioMicrophoneError;
	}
	if (error instanceof VoiceCallSessionError && error.message) {
		return error.message;
	}
	return labels.voiceCallError;
}

function upsertActionMessage(previous, message, afterItemId) {
	if (!message?.id) return previous;
	const existing = previous.find((entry) => entry.id === message.id);
	if (existing) {
		return previous.map((entry) =>
			entry.id === message.id
				? { ...entry, message }
				: entry
		);
	}
	return [
		...previous,
		{
			id: message.id,
			message,
			afterItemId: afterItemId ?? null
		}
	];
}

function renderLiveTranscript(entry, labels) {
	return (
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
	);
}

function renderLiveActionMessage(
	message,
	{
		fetchAnswer,
		onSchedulerBookingMetadata,
		isCalendlyScriptReady,
		isTidyCalScriptReady
	}
) {
	return (
		<div key={message.id} className="docsbot-voice-action-message">
			<BotChatMessage
				payload={message}
				messageBoxRef={{ current: null }}
				fetchAnswer={fetchAnswer || (() => {})}
				onSchedulerBookingMetadata={onSchedulerBookingMetadata}
				isCalendlyScriptReady={isCalendlyScriptReady}
				isTidyCalScriptReady={isTidyCalScriptReady}
			/>
		</div>
	);
}

export function VoiceCallView({
	apiBase,
	teamId,
	botId,
	conversationId,
	signature,
	identify,
	labels,
	color,
	showAgentActivity,
	historyItems = [],
	onConversationId,
	onTranscriptFinal,
	onClientAction,
	onSchedulerBookingMetadata,
	fetchAnswer,
	isCalendlyScriptReady,
	isTidyCalScriptReady,
	onExit
}) {
	const remoteAudioRef = useRef(null);
	const sessionRef = useRef(null);
	const transcriptListRef = useRef(null);
	const transcriptContentRef = useRef(null);
	const stickToBottomRef = useRef(true);
	const attemptRef = useRef(0);
	const voiceStateRef = useRef(createVoiceRealtimeState());
	const [voiceState, setVoiceState] = useState(createVoiceRealtimeState);
	const [agentActivity, setAgentActivity] = useState(null);
	const [actionMessages, setActionMessages] = useState([]);
	const [errorDetail, setErrorDetail] = useState('');
	const [isMuted, setIsMuted] = useState(false);
	const [outputLevel, setOutputLevel] = useState(0);
	const [waveformLevels, setWaveformLevels] = useState(() =>
		Array(32).fill(0.04)
	);

	const isNearBottom = (element) =>
		element.scrollHeight - element.scrollTop - element.clientHeight <= 96;

	const scrollTranscriptsToBottom = useCallback(() => {
		const list = transcriptListRef.current;
		if (!list || !stickToBottomRef.current) return;
		list.scrollTop = list.scrollHeight;
	}, []);

	const cleanupSession = useCallback(() => {
		attemptRef.current += 1;
		sessionRef.current?.close();
		sessionRef.current = null;
	}, []);

	const handleRealtimeEvent = useCallback(
		(event) => {
			setVoiceState((current) => {
				const next = reduceVoiceRealtimeEvent(current, event);
				voiceStateRef.current = next;
				return next;
			});
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

			const clientAction = voiceClientActionFromEvent(event);
			if (clientAction) {
				const message = onClientAction?.(clientAction);
				if (message) {
					const transcripts = orderedVoiceTranscripts(
						voiceStateRef.current
					);
					const afterItemId =
						transcripts[transcripts.length - 1]?.itemId ?? null;
					setActionMessages((previous) =>
						upsertActionMessage(previous, message, afterItemId)
					);
				}
			}

			const finalTranscript = finalVoiceTranscriptFromEvent(event);
			if (finalTranscript) onTranscriptFinal(finalTranscript);
		},
		[onClientAction, onTranscriptFinal]
	);

	const startCall = useCallback(async () => {
		cleanupSession();
		const attempt = ++attemptRef.current;
		const initialVoiceState = createVoiceRealtimeState();
		voiceStateRef.current = initialVoiceState;
		setVoiceState(initialVoiceState);
		setAgentActivity(null);
		setActionMessages([]);
		setErrorDetail('');
		setIsMuted(false);
		setOutputLevel(0);
		setWaveformLevels(Array(32).fill(0.04));

		const metadata = buildVoiceWidgetPublicMetadata(identify, {
			referrer:
				typeof window !== 'undefined' ? window.location.href : undefined
		});
		const session = new DocsBotVoiceCallSession({
			apiBase,
			teamId,
			botId,
			conversationId,
			authToken: signature,
			metadata,
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
					setAgentActivity(null);
					onExit();
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
			if (process.env.NODE_ENV !== 'production') {
				console.warn(
					'DOCSBOT: voice call failed before WebRTC connected',
					error
				);
			}
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
		identify,
		labels,
		onConversationId,
		onExit,
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

	useEffect(() => {
		// Resumed conversations should open scrolled to the latest prior turn.
		if (historyItems.length > 0) {
			stickToBottomRef.current = true;
			scrollTranscriptsToBottom();
		}
	}, [historyItems.length, scrollTranscriptsToBottom]);

	const transcripts = orderedVoiceTranscripts(voiceState);
	const liveItems = interleaveVoiceLiveItems(transcripts, actionMessages);
	const modelAudioLevel =
		voiceState.status === VOICE_CALL_STATUS.AGENT_SPEAKING
			? outputLevel
			: 0;
	const lastTranscript = transcripts[transcripts.length - 1];
	const transcriptScrollKey = lastTranscript
		? `${transcripts.length}:${lastTranscript.itemId}:${lastTranscript.text.length}:${lastTranscript.isFinal ? 1 : 0}`
		: '0';
	const lastAction = actionMessages[actionMessages.length - 1];
	const actionScrollKey = lastAction
		? `${actionMessages.length}:${lastAction.id}`
		: '0';
	const liveActionProps = {
		fetchAnswer,
		onSchedulerBookingMetadata,
		isCalendlyScriptReady,
		isTidyCalScriptReady
	};

	useEffect(() => {
		const list = transcriptListRef.current;
		if (!list) return;
		const onScroll = () => {
			stickToBottomRef.current = isNearBottom(list);
		};
		list.addEventListener('scroll', onScroll, { passive: true });
		onScroll();
		return () => list.removeEventListener('scroll', onScroll);
	}, []);

	useEffect(() => {
		scrollTranscriptsToBottom();
	}, [transcriptScrollKey, actionScrollKey, scrollTranscriptsToBottom]);

	useEffect(() => {
		const content = transcriptContentRef.current;
		if (!content || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(() => {
			scrollTranscriptsToBottom();
		});
		observer.observe(content);
		return () => observer.disconnect();
	}, [scrollTranscriptsToBottom]);

	const statusLabelKey = STATUS_LABEL_KEYS[voiceState.status];
	const statusLabel = statusLabelKey
		? labels[statusLabelKey]
		: undefined;
	const showStatusLabel =
		Boolean(statusLabel) &&
		!STATUS_LABEL_VISIBLE_HIDDEN.has(voiceState.status);
	const orbAriaLabel = STATUS_LABEL_ARIA_HIDDEN.has(voiceState.status)
		? undefined
		: statusLabel;
	const leaveCall = () => {
		cleanupSession();
		setAgentActivity(null);
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

			<div
				ref={transcriptListRef}
				className="docsbot-voice-transcripts"
				role="log"
				aria-live="polite"
				aria-label={labels.voiceCallTranscript}
			>
				<div
					ref={transcriptContentRef}
					className="docsbot-voice-transcripts-inner"
				>
					{historyItems.map((entry) =>
						entry.kind === 'action' ? (
							<div
								key={`history-action-${entry.id}`}
								className="docsbot-voice-action-message is-history"
							>
								<BotChatMessage
									payload={entry.message}
									messageBoxRef={{ current: null }}
									fetchAnswer={fetchAnswer || (() => {})}
									onSchedulerBookingMetadata={
										onSchedulerBookingMetadata
									}
									isCalendlyScriptReady={
										isCalendlyScriptReady
									}
									isTidyCalScriptReady={isTidyCalScriptReady}
								/>
							</div>
						) : (
							renderHistoryTranscript(entry, labels)
						)
					)}
					{liveItems.map((entry) =>
						entry.kind === 'action'
							? renderLiveActionMessage(
									entry.message,
									liveActionProps
								)
							: renderLiveTranscript(entry.transcript, labels)
					)}
				</div>
			</div>

			<div className="docsbot-voice-call-chrome docsbot-voice-call-chrome-top">
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
					<div className="docsbot-voice-call-orb-block">
						<VoiceOrb
							status={voiceState.status}
							color={color}
							label={orbAriaLabel}
							audioLevel={modelAudioLevel}
						/>
						{showStatusLabel ? (
							<div
								className="docsbot-voice-call-status"
								role="status"
								aria-live="polite"
							>
								{statusLabel}
							</div>
						) : null}
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
			</div>

			<div className="docsbot-voice-call-chrome docsbot-voice-call-chrome-bottom">
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
										isMuted
											? faMicrophoneSlash
											: faMicrophone
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
								onClick={leaveCall}
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
		</div>
	);
}
