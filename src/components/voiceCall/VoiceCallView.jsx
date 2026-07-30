import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
	faArrowLeft,
	faMicrophone,
	faMicrophoneSlash,
	faPhoneSlash,
	faRotateRight
} from '@fortawesome/free-solid-svg-icons';
import {
	DocsBotVoiceCallSession,
	VoiceCallSessionError,
	buildVoiceWidgetPublicMetadata
} from '../../utils/voiceCallSession.mjs';
import {
	composeVoiceConversationGroups,
	interleaveVoiceLiveItems,
	flushPendingVoiceActions,
	queuePendingVoiceAction
} from '../../utils/voiceCallHistory.mjs';
import {
	VOICE_CALL_STATUS,
	appendLocalVoiceTranscript,
	createVoiceRealtimeState,
	finalVoiceTranscriptFromEvent,
	orderedVoiceTranscripts,
	reduceVoiceRealtimeEvent,
	voiceClientActionFromEvent,
	voiceToolCallFromEvent
} from '../../utils/voiceRealtimeState.mjs';
import { getSharedVoiceToolWorkingChime } from '../../utils/voiceToolWorkingChime.mjs';
import voiceToolWorkingSrc from '../../assets/audio/voiceToolWorkingSrc.mjs';
import voiceToolSearchingSrc from '../../assets/audio/voiceToolSearchingSrc.mjs';
import { isVoiceSearchToolName } from './voiceOrbPresentation.mjs';
import { BotChatMessage } from '../botChatMessage/BotChatMessage';
import { Options } from '../options/Options';
import { UserChatMessage } from '../userChatMessage/UserChatMessage';
import { VoiceOrb } from './VoiceOrb';
import { isMicrophoneBlockedByPermissionsPolicy } from '../../utils/microphonePermissions.mjs';

const STATUS_LABEL_KEYS = {
	[VOICE_CALL_STATUS.CONNECTING]: 'voiceCallConnecting',
	[VOICE_CALL_STATUS.LISTENING]: 'voiceCallListening',
	[VOICE_CALL_STATUS.THINKING]: 'agentActivityThinking',
	[VOICE_CALL_STATUS.USING_TOOL]: 'agentActivityTool',
	[VOICE_CALL_STATUS.ERROR]: 'voiceCallError',
	[VOICE_CALL_STATUS.ENDED]: 'voiceCallEnded'
};

// Idle / speaking / tool-wait / thinking: aria on the orb only — no status copy.
const STATUS_LABEL_VISIBLE_HIDDEN = new Set([
	VOICE_CALL_STATUS.LISTENING,
	VOICE_CALL_STATUS.USER_SPEAKING,
	VOICE_CALL_STATUS.AGENT_SPEAKING,
	VOICE_CALL_STATUS.THINKING,
	VOICE_CALL_STATUS.USING_TOOL,
	VOICE_CALL_STATUS.ERROR
]);
const STATUS_LABEL_ARIA_HIDDEN = new Set([
	VOICE_CALL_STATUS.USER_SPEAKING,
	VOICE_CALL_STATUS.AGENT_SPEAKING,
	VOICE_CALL_STATUS.THINKING
]);

function safeConnectionError(error, labels) {
	if (isMicrophoneBlockedByPermissionsPolicy(error)) {
		return labels.audioMicrophonePolicyError;
	}
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

function renderMessageBody(
	message,
	{
		fetchAnswer,
		onSchedulerBookingMetadata,
		isCalendlyScriptReady,
		isTidyCalScriptReady,
		onEndVoiceCall,
		onSendVoiceUserText
	}
) {
	if (message.variant === 'user') {
		return (
			<UserChatMessage
				loading={Boolean(message.loading)}
				message={message.message}
				imageUrls={message.imageUrls}
				audio={message.audio}
				messageBoxRef={{ current: null }}
				consecutive={false}
			/>
		);
	}

	return (
		<>
			<BotChatMessage
				payload={message}
				messageBoxRef={{ current: null }}
				fetchAnswer={fetchAnswer || (() => {})}
				onSchedulerBookingMetadata={onSchedulerBookingMetadata}
				isCalendlyScriptReady={isCalendlyScriptReady}
				isTidyCalScriptReady={isTidyCalScriptReady}
				onEndVoiceCall={onEndVoiceCall}
				onSendVoiceUserText={onSendVoiceUserText}
			/>
			{message.options ? <Options options={message.options} /> : null}
		</>
	);
}

function renderConversationGroup(
	group,
	actionProps,
	{ isHistory = false } = {}
) {
	const wrapperClass = `docsbot-voice-conversation-message${
		isHistory ? ' is-history' : ''
	}`;
	return (
		<div key={group.id} className={wrapperClass}>
			{renderMessageBody(group.message, actionProps)}
			{group.attachments.map((attachment) => (
				<div
					key={attachment.id}
					className="docsbot-voice-conversation-attachment"
				>
					{renderMessageBody(attachment, actionProps)}
				</div>
			))}
		</div>
	);
}

function historyEntryMessage(entry) {
	if (entry.message) return entry.message;
	return {
		id: entry.id,
		variant: entry.role === 'caller' ? 'user' : 'chatbot',
		message: entry.text,
		loading: false,
		streaming: false,
		voiceCall: true
	};
}

function liveTranscriptMessage(entry) {
	return {
		id: `voice-${entry.itemId}`,
		variant: entry.role === 'caller' ? 'user' : 'chatbot',
		message: entry.text,
		loading: false,
		streaming: entry.role === 'agent' && !entry.isFinal,
		voiceCall: true,
		realtimeItemId: entry.itemId
	};
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
	const pendingActionsRef = useRef([]);
	/** Dedupes public docsbot_tool_call DOM events by Realtime call id. */
	const emittedToolCallIdsRef = useRef(new Set());
	const toolWorkingChimeRef = useRef(null);
	const toolSearchingChimeRef = useRef(null);
	if (!toolWorkingChimeRef.current) {
		toolWorkingChimeRef.current =
			getSharedVoiceToolWorkingChime(voiceToolWorkingSrc);
		toolSearchingChimeRef.current =
			getSharedVoiceToolWorkingChime(voiceToolSearchingSrc);
	}
	const [voiceState, setVoiceState] = useState(createVoiceRealtimeState);
	const [actionMessages, setActionMessages] = useState([]);
	const [errorDetail, setErrorDetail] = useState('');
	const [isMuted, setIsMuted] = useState(false);
	const [micLevel, setMicLevel] = useState(0);
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
		toolWorkingChimeRef.current?.setActive(false);
		toolSearchingChimeRef.current?.setActive(false);
		sessionRef.current?.close();
		sessionRef.current = null;
	}, []);

	const onExitRef = useRef(onExit);
	onExitRef.current = onExit;
	const exitLifecycleRef = useRef(false);
	// session.close() sets closed=true before teardown, so the 'closed' callback is
	// suppressed. Parent unmount / pagehide / hangup must still run onExit once.
	const endCallLifecycle = useCallback(() => {
		if (exitLifecycleRef.current) return;
		exitLifecycleRef.current = true;
		cleanupSession();
		onExitRef.current?.();
	}, [cleanupSession]);
	const endCallLifecycleRef = useRef(endCallLifecycle);
	endCallLifecycleRef.current = endCallLifecycle;

	const flushPendingActions = useCallback((afterItemId) => {
		const pending = pendingActionsRef.current;
		if (!pending.length) return;
		pendingActionsRef.current = [];
		setActionMessages((previous) => {
			const { actions } = flushPendingVoiceActions(
				previous,
				pending,
				afterItemId
			);
			return actions;
		});
	}, []);

	const handleRealtimeEvent = useCallback(
		(event) => {
			// Reduce against the ref so transcriptOrder is current before
			// onTranscriptFinal runs (setState updaters are not sync).
			const next = reduceVoiceRealtimeEvent(
				voiceStateRef.current || createVoiceRealtimeState(),
				event
			);
			voiceStateRef.current = next;
			setVoiceState(next);

			// Same public DOM event as chat-agent SSE tool_call.
			const toolCall = voiceToolCallFromEvent(event);
			if (
				toolCall &&
				!emittedToolCallIdsRef.current.has(toolCall.callId)
			) {
				emittedToolCallIdsRef.current.add(toolCall.callId);
				document.dispatchEvent(
					new CustomEvent('docsbot_tool_call', {
						detail: {
							name: toolCall.name,
							data: toolCall.data
						}
					})
				);
			}

			const clientAction = voiceClientActionFromEvent(event);
			if (clientAction) {
				const message = onClientAction?.(clientAction);
				if (message) {
					// Wait for the spoken handoff after the tool before showing
					// the card, so buttons land under the post-tool reply.
					pendingActionsRef.current = queuePendingVoiceAction(
						pendingActionsRef.current,
						message
					);
				}
			}

			const finalTranscript = finalVoiceTranscriptFromEvent(event);
			if (finalTranscript) {
				onTranscriptFinal({
					...finalTranscript,
					transcriptOrder: next.transcriptOrder || []
				});
				if (
					finalTranscript.role === 'agent' &&
					pendingActionsRef.current.length
				) {
					flushPendingActions(finalTranscript.itemId);
				}
			}

			if (
				event.type === 'response.done' &&
				pendingActionsRef.current.length
			) {
				const transcripts = orderedVoiceTranscripts(next);
				flushPendingActions(
					transcripts[transcripts.length - 1]?.itemId ?? null
				);
			}
		},
		[flushPendingActions, onClientAction, onTranscriptFinal]
	);

	const startCall = useCallback(async () => {
		cleanupSession();
		const attempt = ++attemptRef.current;
		const initialVoiceState = createVoiceRealtimeState();
		voiceStateRef.current = initialVoiceState;
		setVoiceState(initialVoiceState);
		setActionMessages([]);
		pendingActionsRef.current = [];
		emittedToolCallIdsRef.current = new Set();
		setErrorDetail('');
		setIsMuted(false);
		setMicLevel(0);
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
				setMicLevel(level);
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
					endCallLifecycleRef.current();
				}
			}
		});
		sessionRef.current = session;

		try {
			await Promise.all([
				toolWorkingChimeRef.current?.prime?.(),
				toolSearchingChimeRef.current?.prime?.()
			]);
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
		signature,
		teamId
	]);

	useEffect(() => {
		void startCall();
		const handlePageHide = () => endCallLifecycleRef.current();
		window.addEventListener('pagehide', handlePageHide);
		return () => {
			window.removeEventListener('pagehide', handlePageHide);
			endCallLifecycleRef.current();
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
	const historyGroups = composeVoiceConversationGroups(
		historyItems.map((entry) => ({
			id: entry.id,
			message: historyEntryMessage(entry)
		}))
	);
	const liveGroups = composeVoiceConversationGroups(
		liveItems.map((entry) =>
			entry.kind === 'action'
				? { id: entry.id, message: entry.message }
				: {
						id: entry.id,
						message: liveTranscriptMessage(entry.transcript)
					}
		)
	);
	// Prefer server VAD, but also promote local mic energy so the listening
	// orb reacts even when speech_started is late or missing.
	const micListening =
		!isMuted &&
		micLevel >= 0.08 &&
		!voiceState.agentAudioPlaying &&
		(voiceState.status === VOICE_CALL_STATUS.LISTENING ||
			voiceState.status === VOICE_CALL_STATUS.USER_SPEAKING ||
			voiceState.status === VOICE_CALL_STATUS.THINKING);
	const orbStatus = micListening
		? VOICE_CALL_STATUS.USER_SPEAKING
		: voiceState.status;
	const orbAudioLevel =
		orbStatus === VOICE_CALL_STATUS.USER_SPEAKING
			? micLevel
			: orbStatus === VOICE_CALL_STATUS.AGENT_SPEAKING
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

	useEffect(() => {
		// Mic mute only gates the uplink; keep the tool chime audible.
		const usingTool = voiceState.status === VOICE_CALL_STATUS.USING_TOOL;
		const searching =
			usingTool && isVoiceSearchToolName(voiceState.activeToolName);
		toolSearchingChimeRef.current?.setActive(searching);
		toolWorkingChimeRef.current?.setActive(usingTool && !searching);
	}, [voiceState.status, voiceState.activeToolName]);

	useEffect(() => {
		return () => {
			// Keep the shared unlock across remounts within the same page;
			// only stop playback when leaving the voice view.
			toolWorkingChimeRef.current?.setActive(false);
			toolSearchingChimeRef.current?.setActive(false);
			toolWorkingChimeRef.current = null;
			toolSearchingChimeRef.current = null;
		};
	}, []);

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
		toolWorkingChimeRef.current?.setActive(false);
		toolSearchingChimeRef.current?.setActive(false);
		endCallLifecycle();
	};
	const sendVoiceUserText = useCallback(
		(text) => {
			const trimmed = typeof text === 'string' ? text.trim() : '';
			if (!trimmed) return false;
			const sent = sessionRef.current?.sendUserText(trimmed) ?? false;
			if (!sent) return false;
			const { state: next, itemId } = appendLocalVoiceTranscript(
				voiceStateRef.current,
				{ role: 'caller', text: trimmed }
			);
			if (!itemId) return true;
			voiceStateRef.current = next;
			setVoiceState(next);
			onTranscriptFinal?.({
				itemId,
				role: 'caller',
				text: trimmed,
				transcriptOrder: next.transcriptOrder || []
			});
			return true;
		},
		[onTranscriptFinal]
	);
	const toggleMute = () => {
		const nextMuted = !isMuted;
		sessionRef.current?.setMuted(nextMuted);
		setIsMuted(nextMuted);
	};

	const liveActionProps = {
		fetchAnswer,
		onSchedulerBookingMetadata,
		isCalendlyScriptReady,
		isTidyCalScriptReady,
		onEndVoiceCall: leaveCall,
		onSendVoiceUserText: sendVoiceUserText
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
					{historyGroups.map((group) =>
						renderConversationGroup(group, liveActionProps, {
							isHistory: true
						})
					)}
					{liveGroups.map((group) =>
						renderConversationGroup(group, liveActionProps)
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
							status={orbStatus}
							toolName={voiceState.activeToolName}
							color={color}
							label={orbAriaLabel}
							audioLevel={orbAudioLevel}
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
