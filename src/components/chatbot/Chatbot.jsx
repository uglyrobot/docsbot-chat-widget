/** @format */

import {
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	createRef,
	Suspense
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useChatbot } from '../chatbotContext/ChatbotContext';
import { useConfig } from '../configContext/ConfigContext';
import { BotChatMessage } from '../botChatMessage/BotChatMessage';
import { LeadCollectMessage } from '../leadCollectMessage/LeadCollectMessage';
import { UserChatMessage } from '../userChatMessage/UserChatMessage';
import { Options } from '../options/Options';
import { Loader } from '../loader/Loader';
import clsx from 'clsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
	faXmark,
	faRefresh,
	faPaperPlane,
	faChevronDown,
	faTimes,
	faMicrophone,
	faCheck
} from '@fortawesome/free-solid-svg-icons';
import { faImage } from '@fortawesome/free-regular-svg-icons';
import {
	Emitter,
	decideTextColor,
	scrollToBottom,
	mergeIdentifyMetadata
} from '../../utils/utils';
import {
	agentActivityFromSseEvent,
	parseToolCallPayload,
	isCalendlyToolCallName,
	isCalComToolCallName,
	isTidyCalToolCallName
} from '../../utils/agentActivityFromSse';
import {
	getVisibleMessageKeys,
	sanitizeRestoredConversation
} from '../../utils/chatbotMessageState.mjs';
import {
	safeSetLocalStorageJson,
	trimPersistedChatHistory,
	trimPersistedConversationMessages
} from '../../utils/localStoragePersistence.mjs';
import {
	createPiiRedactionGuard,
	createPiiRedactionSessionStorageEnvelope,
	exportPiiRedactionGuardSession,
	getPiiRedactionSessionStorageKey,
	isPiiRedactionEnabled,
	readPiiRedactionSessionStorageEnvelope
} from '../../utils/piiRedaction.mjs';
import { loadCalendlyWidgetScript } from '../../utils/calendly';
import { loadTidyCalWidgetScript } from '../../utils/tidycal';
import { LazyStreamdown } from '../streamdown/LazyStreamdown';
import DocsBotLogo from '../../assets/images/docsbot-logo.svg';
import { fetchEventSource } from '@microsoft/fetch-event-source';

// Define error classes for fetchEventSource
class RetriableError extends Error {}
class FatalError extends Error {}

function resolveSchedulerEmbedForToolCall(toolCall, enabledProviders) {
	const toolName = toolCall?.name;
	const params = parseSchedulerPayload(toolCall?.params);
	if (!params?.eventPath) {
		return null;
	}

	if (
		enabledProviders?.calendly &&
		isCalendlyToolCallName(toolName)
	) {
		return buildSchedulerEmbed('calendly', params);
	}

	if (enabledProviders?.calcom && isCalComToolCallName(toolName)) {
		return buildSchedulerEmbed('calcom', params);
	}

	if (enabledProviders?.tidycal && isTidyCalToolCallName(toolName)) {
		return buildSchedulerEmbed('tidycal', params);
	}

	return null;
}

function resolveSchedulerEmbedForEventType(eventType, eventData, enabledProviders) {
	const normalized = String(eventType || '').trim().toLowerCase();
	if (!normalized) return null;
	const payload = parseSchedulerPayload(eventData);
	if (!payload?.eventPath) return null;

	if (enabledProviders?.calendly && normalized === 'calendly') {
		return buildSchedulerEmbed('calendly', payload);
	}

	if (enabledProviders?.calcom && normalized === 'calcom') {
		return buildSchedulerEmbed('calcom', payload);
	}

	if (enabledProviders?.tidycal && normalized === 'tidycal') {
		return buildSchedulerEmbed('tidycal', payload);
	}

	return null;
}

function buildSchedulerEmbed(provider, payload) {
	const eventPath =
		typeof payload?.eventPath === 'string' ? payload.eventPath.trim() : '';
	if (!eventPath) {
		return null;
	}

	return {
		provider,
		path: eventPath,
		hideEventDetails: Boolean(payload?.hideEventDetails),
		hideCookieBanner: Boolean(payload?.hideCookieBanner),
		hideEventDetail: Boolean(payload?.hideEventDetail)
	};
}

function parseSchedulerPayload(payload) {
	if (!payload) return null;
	if (typeof payload === 'string') {
		try {
			return JSON.parse(payload);
		} catch {
			return null;
		}
	}
	return typeof payload === 'object' ? payload : null;
}

function parseToolCallDataPayload(params) {
	if (params == null) return null;
	if (typeof params === 'string') {
		try {
			return JSON.parse(params);
		} catch {
			return params;
		}
	}
	return typeof params === 'object' ? params : null;
}

function isEmptyReasoningEvent(rawData) {
	let parsed = rawData;
	if (typeof parsed === 'string') {
		try {
			parsed = JSON.parse(parsed);
		} catch {
			parsed = { text: parsed };
		}
	}
	const text =
		parsed && typeof parsed === 'object' && parsed.text != null
			? String(parsed.text)
			: '';
	return text.replace(/\*\*/g, '').trim().length === 0;
}

function isSchedulerEnabled(toggleOrPath) {
	if (toggleOrPath === true) return true;
	if (toggleOrPath === false || toggleOrPath == null) return false;
	return typeof toggleOrPath === 'string' && Boolean(toggleOrPath.trim());
}

function isSameSchedulerEmbed(a, provider, path) {
	return (
		a &&
		a.provider === provider &&
		a.path === path
	);
}

/**
 * True when Permissions Policy / legacy Feature Policy disallows microphone in this document
 * (embedding page or iframe — not user denial).
 */
function isMicrophoneDisallowedByEmbeddedPagePolicy() {
	if (typeof document === 'undefined') return false;
	const policy = document.permissionsPolicy || document.featurePolicy;
	if (!policy || typeof policy.allowsFeature !== 'function') {
		return false;
	}
	try {
		return policy.allowsFeature('microphone') === false;
	} catch {
		return false;
	}
}

/** Fallback when {@link document.permissionsPolicy} is missing or unreliable. */
function errorSuggestsMicrophoneBlockedByPermissionsPolicy(error) {
	const msg = String(error?.message || '').toLowerCase();
	return (
		msg.includes('permissions policy') || msg.includes('not allowed in this document')
	);
}

// Wrapper component to coordinate a 2s loading delay on the bot message
// before revealing both the lead collect message text and the form together.
const LeadCollectBlock = ({ message, children }) => {
	const [ready, setReady] = useState(false);

	useEffect(() => {
		setReady(false);
		const timer = setTimeout(() => setReady(true), 1000);
		return () => clearTimeout(timer);
	}, [message.id]);

	return children(ready);
};

export const Chatbot = ({ isOpen, setIsOpen, isEmbeddedBox, chatPanelId }) => {
	const [chatInput, setChatInput] = useState('');
	const [selectedImages, setSelectedImages] = useState([]);
	const [imageUrls, setImageUrls] = useState([]);
	const [isDragging, setIsDragging] = useState(false);
	const { dispatch, state } = useChatbot();
	const {
		color,
		teamId,
		botId,
		signature,
		botName,
		botIcon,
		description,
		branding,
		labels,
		alignment,
		questions,
		identify,
		horizontalMargin,
		verticalMargin,
		logo,
		headerAlignment,
		hideHeader,
		inputLimit,
		contextItems,
		isAgent, // If new agent api is enabled
		showAgentActivity, // false hides reasoning/tool_call status line (default true)
		reasoningEffort, // Optional reasoning_effort override
		useFeedback, // If feedback collection is enabled
		useEscalation, // If escalation collection is enabled
		useImageUpload, // If image upload is enabled
		useAudioUpload, // If audio message recording is enabled
		useWebSearch, // If agent web search tool is enabled (API)
		useCustomButtons, // Agent API: request custom_button terminal events
		useCalendly,
		useCalCom,
		useTidyCal,
		keepFooterVisible,
		localDev,
		allowedDomains,
		linkSafetyEnabled,
		leadCollect,
		updateIdentity,
		supportCallback,
		supportLink,
		browserLocaleTag,
		browserRequestLanguageTag,
		piiRedaction
	} = useConfig();
	const ref = useRef();
	const inputRef = useRef();
	const fileInputRef = useRef(null);
	const mediaRecorderRef = useRef(null);
	const audioChunksRef = useRef([]);
	const discardAudioOnStopRef = useRef(false);
	const recordingTimerRef = useRef(null);
	const recordingStartedAtRef = useRef(0);
	const audioContextRef = useRef(null);
	const audioSourceRef = useRef(null);
	const audioAnalyserRef = useRef(null);
	const audioAnalysisFrameRef = useRef(null);
	const lastAudioWaveformUpdateRef = useRef(0);
	const chatInputId = useId();
	const chatInputLabelId = useId();
	const mediaMatch = window.matchMedia('(min-width: 480px)');
	const messagesRefs = useRef({});
	const [isFetching, setIsFetching] = useState(false);
	const [isAtBottom, setIsAtBottom] = useState(true);
	const [pendingTopScrollMessageId, setPendingTopScrollMessageId] =
		useState(null);
	const [anchoredTopScrollMessageId, setAnchoredTopScrollMessageId] =
		useState(null);
	const [bottomScrollSpacerHeight, setBottomScrollSpacerHeight] =
		useState(0);
	const anchoredTopScrollClientHeightRef = useRef(null);
	const [isCalendlyScriptReady, setIsCalendlyScriptReady] = useState(false);
	const [isTidyCalScriptReady, setIsTidyCalScriptReady] = useState(false);
	const [isRecordingAudio, setIsRecordingAudio] = useState(false);
	const [audioRecordingElapsedMs, setAudioRecordingElapsedMs] = useState(0);
	const [audioWaveformLevels, setAudioWaveformLevels] = useState(() =>
		Array(40).fill(0.04)
	);
	const [streamController, setStreamController] = useState(null);
	const streamControllerRef = useRef(null);
	const requestIdCounterRef = useRef(0);
	const activeRequestIdRef = useRef(null);
	const piiRedactionGuardRef = useRef(null);
	const piiRedactionGuardPromiseRef = useRef(null);
	const piiRedactionModeRef = useRef(null);
	const piiRedactionBypassedRef = useRef(false);
	const piiRedactionSessionKeyRef = useRef('');
	const stateMessagesRef = useRef(state.messages);
	const hasRestoredConversationRef = useRef(false);
	const shouldRedactPii = isPiiRedactionEnabled(piiRedaction);
	const hasConversationStarted = Object.keys(state.messages).length > 1;
	const isLeadFormVisible = Object.values(state.messages || {}).some(
		(message) =>
			message?.variant === 'chatbot' && message?.type === 'lead_collect'
	);
	const [pendingLeadCapture, setPendingLeadCapture] = useState(null);
	const [isLeadCaptureLocked, setIsLeadCaptureLocked] = useState(false);
	const [leadCollected, setLeadCollected] = useState(false);
	const [isPiiRedactionLoading, setIsPiiRedactionLoading] = useState(false);
	const [
		isPiiRedactionOverrideAvailable,
		setIsPiiRedactionOverrideAvailable
	] = useState(false);
	const [isPiiRedactionBypassed, setIsPiiRedactionBypassed] = useState(false);
	const isPiiRedactionBlockingSend =
		isPiiRedactionLoading && !isPiiRedactionBypassed;
	const showPiiRedactionStatus =
		shouldRedactPii &&
		isPiiRedactionLoading &&
		!piiRedactionGuardRef.current;

	useEffect(() => {
		streamControllerRef.current = streamController;
	}, [streamController]);

	useEffect(() => {
		stateMessagesRef.current = state.messages;
	}, [state.messages]);

	useEffect(() => {
		piiRedactionGuardRef.current = null;
		piiRedactionGuardPromiseRef.current = null;
		piiRedactionModeRef.current = null;
		piiRedactionBypassedRef.current = false;
		setIsPiiRedactionLoading(false);
		setIsPiiRedactionOverrideAvailable(false);
		setIsPiiRedactionBypassed(false);
	}, [piiRedaction]);

	useEffect(() => {
		return () => {
			if (recordingTimerRef.current) {
				window.clearInterval(recordingTimerRef.current);
				recordingTimerRef.current = null;
			}
			stopAudioAnalysis();
			const c = streamControllerRef.current;
			if (c && typeof c.abort === 'function') {
				c.abort();
			} else if (c && typeof c.close === 'function') {
				c.close();
			}
			const recorder = mediaRecorderRef.current;
			if (recorder && recorder.state !== 'inactive') {
				discardAudioOnStopRef.current = true;
				recorder.stop();
			}
		};
	}, []);

	const allowedSingleCharLanguages = ['ja', 'zh', 'ko'];
	const navLangList =
		typeof navigator !== 'undefined' && Array.isArray(navigator.languages)
			? navigator.languages
			: typeof navigator !== 'undefined' && navigator.language
				? [navigator.language]
				: [];
	const allowSingleCharMessage = navLangList.some((tag) =>
		allowedSingleCharLanguages.some((lang) =>
			typeof tag === 'string' && tag.toLowerCase().startsWith(lang)
		)
	);
	const minInputLength = allowSingleCharMessage ? 1 : 2;
	const isCalendlyEnabled = isSchedulerEnabled(useCalendly);
	const isCalComEnabled = isSchedulerEnabled(useCalCom);
	const isTidyCalEnabled = isSchedulerEnabled(useTidyCal);
	const isAudioUploadEnabled =
		Boolean(useAudioUpload) &&
		isAgent &&
		typeof navigator !== 'undefined' &&
		Boolean(navigator.mediaDevices?.getUserMedia) &&
		typeof window.MediaRecorder !== 'undefined';
	const showAudioRecordButton =
		isAudioUploadEnabled &&
		!isRecordingAudio &&
		chatInput === '';
	const maxAudioBytes = 25 * 1024 * 1024;
	const maxAudioRecordingMs = 30 * 1000;
	const audioMimeType =
		typeof window.MediaRecorder !== 'undefined' &&
		window.MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')
			? 'audio/webm;codecs=opus'
			: 'audio/webm';

const removeExistingSchedulerEmbeds = (
		schedulerEmbed,
		excludeMessageId = null
	) => {
		if (!schedulerEmbed?.provider || !schedulerEmbed?.path) return;

	Object.values(state.messages || {}).forEach((message) => {
		if (
			message?.id === excludeMessageId ||
			message?.variant !== 'chatbot' ||
				!isSameSchedulerEmbed(
					message?.schedulerEmbed,
					schedulerEmbed.provider,
					schedulerEmbed.path
				)
		) {
			return;
		}

		dispatch({
			type: 'update_message',
			payload: {
				id: message.id,
				schedulerEmbed: null
			}
		});
	});
};


	const handleImageSelect = (e) => {
		if (!useImageUpload) return;
		const files = Array.from(e.target.files);
		processImageFiles(files);
		// Allow selecting the same file again after removing it.
		e.target.value = '';
	};

	const processImageFiles = (files) => {
		if (!useImageUpload || files.length === 0) return;

		// Limit to max 2 images total
		if (selectedImages.length + files.length > 2) {
			const maxImages = 2;
			const remainingSlots = maxImages - selectedImages.length;
			const filesToProcess = files.slice(0, remainingSlots);

			if (filesToProcess.length < files.length) {
				console.warn(
					`DOCSBOT: Only processing ${filesToProcess.length} of ${files.length} images. Maximum ${maxImages} images allowed.`
				);
			}

			// Replace files with the trimmed array
			files = filesToProcess;
		}

		files.forEach((file) => {
			if (!file.type.startsWith('image/')) {
				// Could add an error message here
				return;
			}

			const reader = new FileReader();
			reader.onload = (e) => {
				const img = new Image();
				img.onload = () => {
					// Calculate new dimensions while maintaining aspect ratio
					let width = img.width;
					let height = img.height;
					const maxSize = 1200;

					if (width > height && width > maxSize) {
						height = (height * maxSize) / width;
						width = maxSize;
					} else if (height > maxSize) {
						width = (width * maxSize) / height;
						height = maxSize;
					}

					// Create canvas and resize image for full-size version
					const canvas = document.createElement('canvas');
					canvas.width = width;
					canvas.height = height;
					const ctx = canvas.getContext('2d');
					ctx.drawImage(img, 0, 0, width, height);

					// Convert to base64 with compression for full-size image
					const fullSizeBase64 = canvas.toDataURL('image/jpeg', 0.8);

					// Create thumbnail for history (max 200px)
					const thumbnailBase64 = createThumbnail(img, 200);

					setSelectedImages((prev) => [
						...prev,
						{
							url: fullSizeBase64,
							file,
							thumbnailUrl: thumbnailBase64
						}
					]);
					setImageUrls((prev) => [...prev, fullSizeBase64]);
				};
				img.src = e.target.result;
			};
			reader.readAsDataURL(file);
		});
	};

	// Create a smaller thumbnail version of the image for chat history
	const createThumbnail = (imgElement, maxSize) => {
		// Calculate new dimensions while maintaining aspect ratio
		let width = imgElement.width;
		let height = imgElement.height;

		if (width > height && width > maxSize) {
			height = (height * maxSize) / width;
			width = maxSize;
		} else if (height > maxSize) {
			width = (width * maxSize) / height;
			height = maxSize;
		}

		// Create canvas and resize image for thumbnail
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		ctx.drawImage(imgElement, 0, 0, width, height);

		// Convert to base64 with higher compression for thumbnail
		return canvas.toDataURL('image/jpeg', 0.6);
	};

	const removeImage = (index) => {
		setSelectedImages((prev) => prev.filter((_, i) => i !== index));
		setImageUrls((prev) => prev.filter((_, i) => i !== index));
	};

	const triggerFileInput = () => {
		if (!useImageUpload) return;
		// Ensure browser dispatches `change` even if the same file is selected.
		fileInputRef.current.value = '';
		fileInputRef.current.click();
	};

	const blobToDataUrl = (blob) =>
		new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});

	const addAudioErrorMessage = (message, options = {}) => {
		const existing = Object.values(stateMessagesRef.current || {});
		const lastByTime =
			existing.length === 0
				? null
				: existing.reduce((latest, m) =>
						(m.timestamp ?? 0) >= (latest.timestamp ?? 0) ? m : latest
					);
		if (
			lastByTime &&
			lastByTime.variant === 'chatbot' &&
			lastByTime.error === true &&
			lastByTime.message === message
		) {
			scrollToBottom(ref);
			return;
		}
		dispatch({
			type: 'add_message',
			payload: {
				id: uuidv4(),
				variant: 'chatbot',
				message,
				loading: false,
				error: true,
				suppressSupportButton: Boolean(options.suppressSupportButton),
				streaming: false,
				timestamp: Date.now()
			}
		});
		scrollToBottom(ref);
	};

	const sendAudioBlob = async (blob) => {
		if (!blob || blob.size === 0) return;
		if (blob.size > maxAudioBytes) {
			addAudioErrorMessage(labels.audioTooLarge);
			return;
		}

		try {
			const webmBlob = new Blob([blob], { type: 'audio/webm' });
			const dataUrl = await blobToDataUrl(webmBlob);
			const userMessageId = uuidv4();
			const historyImageUrls =
				useImageUpload && selectedImages.length > 0
					? selectedImages.map((img) => img.thumbnailUrl)
					: undefined;
			dispatch({
				type: 'add_message',
				payload: {
					id: userMessageId,
					variant: 'user',
					message: labels.audioTranscribing,
					loading: true,
					timestamp: Date.now(),
					audio: true,
					imageUrls: historyImageUrls
				}
			});
			fetchAnswer('', useImageUpload ? imageUrls : [], {
				audio: dataUrl,
				audioUserMessageId: userMessageId
			});
			if (useImageUpload) {
				setSelectedImages([]);
				setImageUrls([]);
			}
			scrollMessageToTopAfterRender(userMessageId);
		} catch (error) {
			console.warn('DOCSBOT: Failed to process voice message', error);
			addAudioErrorMessage(labels.audioRecordingError);
		}
	};

	const clearAudioRecordingTimer = () => {
		if (recordingTimerRef.current) {
			window.clearInterval(recordingTimerRef.current);
			recordingTimerRef.current = null;
		}
	};

	const stopAudioAnalysis = () => {
		if (audioAnalysisFrameRef.current) {
			window.cancelAnimationFrame(audioAnalysisFrameRef.current);
			audioAnalysisFrameRef.current = null;
		}
		if (audioSourceRef.current) {
			audioSourceRef.current.disconnect();
			audioSourceRef.current = null;
		}
		audioAnalyserRef.current = null;
		if (audioContextRef.current) {
			void audioContextRef.current.close();
			audioContextRef.current = null;
		}
		lastAudioWaveformUpdateRef.current = 0;
	};

	const updateAudioWaveform = () => {
		const analyser = audioAnalyserRef.current;
		if (!analyser) return;

		const now = performance.now();
		if (now - lastAudioWaveformUpdateRef.current >= 80) {
			const samples = new Uint8Array(analyser.fftSize);
			analyser.getByteTimeDomainData(samples);
			let sumSquares = 0;
			for (let i = 0; i < samples.length; i++) {
				const centeredSample = (samples[i] - 128) / 128;
				sumSquares += centeredSample * centeredSample;
			}
			const rms = Math.sqrt(sumSquares / samples.length);
			const level = Math.min(1, Math.max(0.04, rms * 3.6));
			setAudioWaveformLevels((prev) => [...prev.slice(1), level]);
			lastAudioWaveformUpdateRef.current = now;
		}

		audioAnalysisFrameRef.current =
			window.requestAnimationFrame(updateAudioWaveform);
	};

	const startAudioAnalysis = (stream) => {
		stopAudioAnalysis();
		const AudioContextConstructor =
			window.AudioContext || window.webkitAudioContext;
		if (!AudioContextConstructor) return;

		try {
			const audioContext = new AudioContextConstructor();
			const source = audioContext.createMediaStreamSource(stream);
			const analyser = audioContext.createAnalyser();
			analyser.fftSize = 1024;
			analyser.smoothingTimeConstant = 0.72;
			source.connect(analyser);

			audioContextRef.current = audioContext;
			audioSourceRef.current = source;
			audioAnalyserRef.current = analyser;
			lastAudioWaveformUpdateRef.current = 0;
			audioAnalysisFrameRef.current =
				window.requestAnimationFrame(updateAudioWaveform);
		} catch (error) {
			console.warn('DOCSBOT: Failed to start audio analysis', error);
		}
	};

	const updateAudioRecordingElapsed = () => {
		const elapsed = Math.min(
			Date.now() - recordingStartedAtRef.current,
			maxAudioRecordingMs
		);
		setAudioRecordingElapsedMs(elapsed);
		if (elapsed >= maxAudioRecordingMs) {
			stopAudioRecording({ send: true });
		}
	};

	const formatAudioRecordingTime = (milliseconds) => {
		const seconds = Math.min(
			Math.ceil(milliseconds / 1000),
			Math.ceil(maxAudioRecordingMs / 1000)
		);
		return `0:${String(seconds).padStart(2, '0')}`;
	};

	const stopAudioRecording = ({ send = true } = {}) => {
		const recorder = mediaRecorderRef.current;
		if (!recorder || recorder.state === 'inactive') return;
		discardAudioOnStopRef.current = !send;
		recorder.stop();
	};

	const startAudioRecording = async () => {
		if (
			!isAudioUploadEnabled ||
			isFetching ||
			isPiiRedactionLoading ||
			isLeadFormVisible
		) return;

		if (isMicrophoneDisallowedByEmbeddedPagePolicy()) {
			console.warn(
				'DOCSBOT: Microphone blocked by embedding page Permissions-Policy — microphone is not allowed in this widget document (no prompt was shown)'
			);
			addAudioErrorMessage(labels.audioMicrophonePolicyError, {
				suppressSupportButton: true
			});
			return;
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			});
			discardAudioOnStopRef.current = false;
			audioChunksRef.current = [];
			setAudioRecordingElapsedMs(0);
			setAudioWaveformLevels(Array(40).fill(0.04));
			startAudioAnalysis(stream);
			const recorder = new MediaRecorder(stream, { mimeType: audioMimeType });
			mediaRecorderRef.current = recorder;

			recorder.ondataavailable = (event) => {
				if (event.data?.size > 0) {
					audioChunksRef.current.push(event.data);
				}
			};

			recorder.onstop = () => {
				stream.getTracks().forEach((track) => track.stop());
				clearAudioRecordingTimer();
				stopAudioAnalysis();
				setIsRecordingAudio(false);
				if (discardAudioOnStopRef.current) {
					discardAudioOnStopRef.current = false;
					audioChunksRef.current = [];
					setAudioRecordingElapsedMs(0);
					setAudioWaveformLevels(Array(40).fill(0.04));
					return;
				}
				const blob = new Blob(audioChunksRef.current, {
					type: 'audio/webm'
				});
				audioChunksRef.current = [];
				setAudioRecordingElapsedMs(0);
				setAudioWaveformLevels(Array(40).fill(0.04));
				void sendAudioBlob(blob);
			};

			recorder.onerror = (event) => {
				console.warn('DOCSBOT: Voice recording error', event.error || event);
				discardAudioOnStopRef.current = true;
				stream.getTracks().forEach((track) => track.stop());
				clearAudioRecordingTimer();
				stopAudioAnalysis();
				setIsRecordingAudio(false);
				setAudioRecordingElapsedMs(0);
				setAudioWaveformLevels(Array(40).fill(0.04));
				addAudioErrorMessage(labels.audioRecordingError);
			};

			recorder.start();
			recordingStartedAtRef.current = Date.now();
			recordingTimerRef.current = window.setInterval(
				updateAudioRecordingElapsed,
				100
			);
			setIsRecordingAudio(true);
		} catch (error) {
			const policyBlocked =
				isMicrophoneDisallowedByEmbeddedPagePolicy() ||
				errorSuggestsMicrophoneBlockedByPermissionsPolicy(error);
			if (policyBlocked) {
				console.warn(
					'DOCSBOT: Microphone blocked by embedding page Permissions-Policy — not user denial; microphone is disallowed for this widget document',
					error
				);
				addAudioErrorMessage(labels.audioMicrophonePolicyError, {
					suppressSupportButton: true
				});
			} else {
				console.warn(
					'DOCSBOT: Microphone access failed (permission denied / unavailable — user or browser)',
					error
				);
				addAudioErrorMessage(labels.audioMicrophoneError, {
					suppressSupportButton: true
				});
			}
		}
	};

	const handleAudioButtonClick = () => {
		void startAudioRecording();
	};

	const isEmbeddedAutoHeightHost = () => {
		if (!isEmbeddedBox || !ref.current) return false;
		const rootNode = ref.current.getRootNode?.();
		const host = rootNode?.host;
		if (!(host instanceof window.HTMLElement)) return false;
		const embedHost =
			host.id === 'docsbot-widget-embed'
				? host
				: host.closest('#docsbot-widget-embed') ?? host;
		return embedHost.style.height.trim().toLowerCase() === 'auto';
	};

	const scrollMessageToTopAfterRender = (messageId) => {
		anchoredTopScrollClientHeightRef.current = null;
		setAnchoredTopScrollMessageId(messageId);
		setPendingTopScrollMessageId(messageId);
	};

	useEffect(() => {
		Emitter.on('docsbot_add_user_message', ({ message, send }) => {
			const messageId = uuidv4();
			dispatch({
				type: 'add_message',
				payload: {
					id: messageId,
					variant: 'user',
					message: message,
					loading: false,
					timestamp: Date.now()
				}
			});

			scrollMessageToTopAfterRender(messageId);

			if (send) {
				fetchAnswer(message);
			}

			Emitter.emit('docsbot_add_user_message_complete');
		});

		Emitter.on('docsbot_add_bot_message', async ({ message }) => {
			await dispatch({
				type: 'add_message',
				payload: {
					id: uuidv4(),
					variant: 'chatbot',
					message: message,
					loading: false,
					streaming: false,
					timestamp: Date.now()
				}
			});

			Emitter.emit('docsbot_add_bot_message_complete');
		});

		Emitter.on('docsbot_clear_history', async () => {
			await refreshChatHistory();
			Emitter.emit('docsbot_clear_history_complete');
		});

		// Clean up event listeners
		return () => {
			Emitter.off('docsbot_add_user_message');
			Emitter.off('docsbot_add_bot_message');
			Emitter.off('docsbot_clear_history');
		};
	}, []);

	const getLeadFieldPrefill = (field) => {
		if (!field?.key) return '';
		const metadata = mergeIdentifyMetadata(identify);
		const value = metadata?.[field.key];
		if (value === null || value === undefined) return undefined;
		if (typeof value === 'string' && value.trim().length === 0) {
			return undefined;
		}
		return String(value);
	};

	const isLeadCollectEnabled = () => {
		return leadCollect !== false && leadCollect?.enabled !== false;
	};

	const isLeadCollectionSatisfied = () => {
		if (!isLeadCollectEnabled()) return false;
		if (!leadCollect || !Array.isArray(leadCollect.fields)) return false;
		const metadata = mergeIdentifyMetadata(identify);
		const requiredFields = leadCollect.fields.filter(
			(field) => field?.required
		);
		const fieldsToCheck =
			requiredFields.length > 0 ? requiredFields : leadCollect.fields;

		return fieldsToCheck.every((field) => {
			if (!field?.key) return false;
			const value = metadata?.[field.key];
			return (
				value !== undefined &&
				value !== null &&
				String(value).trim().length > 0
			);
		});
	};

	const buildLeadFormMessage = (modeOverride = null) => {
		if (!isLeadCollectEnabled()) return null;
		if (!leadCollect || !Array.isArray(leadCollect.fields)) return null;
		if (leadCollect.fields.length === 0) return null;

		const fields = leadCollect.fields.map((field) => {
			const { value: _ignoredConfigValue, ...safeField } = field || {};
			const prefillValue = getLeadFieldPrefill(safeField);
			const isPrefilled =
				prefillValue !== undefined &&
				prefillValue !== null &&
				!(
					typeof prefillValue === 'string' &&
					prefillValue.trim().length === 0
				);

			return {
				...safeField,
				value: prefillValue,
				isPrefilled
			};
		});

		return {
			id: uuidv4(),
			variant: 'chatbot',
			type: 'lead_collect',
			message: labels.leadCollectMessage,
			loading: false,
			streaming: false,
			timestamp: Date.now(),
			leadForm: {
				mode: modeOverride || leadCollect.mode,
				fields
			}
		};
	};

	const captureLead = async (metadata) => {
		const conversationId = getConversationId();
		const apiBase = localDev
			? `http://127.0.0.1:9000`
			: `https://api.docsbot.ai`;
		const apiUrl = `${apiBase}/teams/${teamId}/bots/${botId}/conversations/${conversationId}/lead`;

		try {
			const response = await fetch(apiUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					accept: 'application/json',
					...(signature && {
						Authorization: `Bearer ${signature}`
					})
				},
				body: JSON.stringify({ metadata })
			});

			if (!response.ok) {
				console.warn(
					'DOCSBOT: Failed to capture lead',
					response.status,
					response.statusText
				);
			}
		} catch (err) {
			console.warn('DOCSBOT: Failed to capture lead', err);
		}
	};

	const updateConversationMetadata = async (metadata) => {
		const conversationId = getConversationId();
		const apiBase = localDev
			? `http://127.0.0.1:9000`
			: `https://api.docsbot.ai`;
		const apiUrl = `${apiBase}/teams/${teamId}/bots/${botId}/conversations/${conversationId}`;
		console.log('Updating Conversation Metadata:', {
			conversationId,
			metadata,
			fullChange: false
		});

		try {
			const response = await fetch(apiUrl, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					accept: 'application/json',
					...(signature && {
						Authorization: `Bearer ${signature}`
					})
				},
				body: JSON.stringify({
					metadata,
					fullChange: false
				})
			});
			let responseBody = null;
			try {
				responseBody = await response.clone().json();
			} catch {
				try {
					responseBody = await response.text();
				} catch {
					responseBody = null;
				}
			}
			console.log('Conversation Metadata Update Response:', {
				ok: response.ok,
				status: response.status,
				body: responseBody
			});
		} catch (err) {
			console.warn('DOCSBOT: Failed to update conversation metadata', err);
		}
	};

	const handleLeadCollectSubmit = (message, data, event) => {
		if (!isLeadCollectEnabled()) return;

		const metadata = mergeIdentifyMetadata(identify);
		const leadMetadata = {
			...metadata,
			...(data.metadata || {})
		};
		const activeLeadContext =
			pendingLeadCapture || message?.leadContext || null;

		updateIdentity(leadMetadata);
		void captureLead(leadMetadata);

		if (leadCollect?.mode === 'before_escalation') {
			setLeadCollected(true);
			finalizeLeadSubmission(
				{
					nextAction: 'support_escalation'
				},
				leadMetadata,
				{
					messageId: message?.id,
					event
				}
			);
			return;
		}

		const isBeforeResponse =
			activeLeadContext?.type === 'before_response';
		finalizeLeadSubmission(
			{
				...data,
				question: activeLeadContext?.question,
				imageUrls: activeLeadContext?.imageUrls,
				audio: activeLeadContext?.audio,
				audioUserMessageId: activeLeadContext?.audioUserMessageId,
				nextAction: isBeforeResponse
					? 'send_message'
					: data.nextAction
			},
			leadMetadata,
			{
				messageId: message?.id,
				event
			}
		);
	};

	const triggerSupportEscalationFromLead = async (event, metadata) => {
		const history = pendingLeadCapture?.history || state.chatHistory || [];
		let shouldOpenLink = true;
		const hasSupportLink = Boolean(supportLink && supportLink !== '#');
		const supportWindow =
			event && hasSupportLink ? window.open('', '_blank') : null;
		const syntheticEvent = event
			? {
					...event,
					nativeEvent: event.nativeEvent || event
				}
			: {};
		syntheticEvent.preventDefault = () => {
			shouldOpenLink = false;
			if (supportWindow && !supportWindow.closed) {
				supportWindow.close();
			}
		};

		const maybeOpenSupportLink = () => {
			if (!hasSupportLink || !shouldOpenLink) {
				if (supportWindow && !supportWindow.closed) {
					supportWindow.close();
				}
				return;
			}

			if (supportWindow && !supportWindow.closed) {
				supportWindow.location.href = supportLink;
				return;
			}

			window.open(supportLink, '_blank');
		};

		try {
			if (supportCallback && typeof supportCallback === 'function') {
				const paramCount = supportCallback.length;
				if (paramCount <= 2) {
					await supportCallback(syntheticEvent, history);
				} else if (paramCount === 3) {
					await supportCallback(syntheticEvent, history, metadata);
				} else {
					const apiBase = localDev
						? `http://127.0.0.1:9000`
						: `https://api.docsbot.ai`;
					if (getConversationId() && isAgent) {
						let ticket = null;
						try {
							const ticketResponse = await fetch(
								`${apiBase}/teams/${teamId}/bots/${botId}/conversations/${getConversationId()}/ticket`,
								{
									headers: {
										'Content-Type': 'application/json',
										accept: 'application/json',
										...(signature && {
											Authorization: `Bearer ${signature}`
										})
									}
								}
							);
							ticket = await ticketResponse.json();
						} catch (_error) {
							ticket = null;
						}
						await supportCallback(
							syntheticEvent,
							history,
							metadata,
							ticket
						);
					} else {
						await supportCallback(
							syntheticEvent,
							history,
							metadata,
							null
						);
					}
				}
			}

			maybeOpenSupportLink();
		} catch (err) {
			maybeOpenSupportLink();
			console.warn(`DOCSBOT: Error in support callback: ${err}`);
		}

		const apiBase = localDev
			? `http://127.0.0.1:9000`
			: `https://api.docsbot.ai`;
		const apiUrl = `${apiBase}/teams/${teamId}/bots/${botId}/conversations/${getConversationId()}/escalate`;
		fetch(apiUrl, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				accept: 'application/json',
				...(signature && {
					Authorization: `Bearer ${signature}`
				})
			}
		}).catch((err) => {
			console.warn(`DOCSBOT: Error recording support click: ${err}`);
		});
	};

	const finalizeLeadSubmission = (data, metadata, options = {}) => {
		const { messageId, event } = options;
		setIsLeadCaptureLocked(false);
		setLeadCollected(true);

		if (messageId) {
			dispatch({
				type: 'remove_message',
				payload: { id: messageId }
			});
		}

		if (data?.nextAction === 'send_message') {
			setPendingLeadCapture(null);
			fetchAnswer(data.question, data.imageUrls || [], {
				bypassLeadCollect: true,
				metadataOverride: metadata,
				audio: data.audio,
				audioUserMessageId: data.audioUserMessageId
			});
			return;
		}

		if (data?.nextAction === 'support_escalation') {
			// Set trigger: true so the useEffect in BotChatMessage picks it up
			// and calls runSupportCallback (which shows the loader on the Yes button)
			setPendingLeadCapture((prev) => ({
				...(prev || {}),
				type: 'support',
				trigger: true,
				metadata: metadata
			}));
			return;
		}

		setPendingLeadCapture(null);
	};

	const getConversationId = () => {
		let conversationId = localStorage.getItem(
			`DocsBot_${botId}_conversationId`
		);
		if (!conversationId) {
			conversationId = uuidv4();
			localStorage.setItem(
				`DocsBot_${botId}_conversationId`,
				conversationId
			);
		}
		return conversationId;
	};

	const getStoredConversationId = () => {
		return localStorage.getItem(`DocsBot_${botId}_conversationId`);
	};

	const getPiiRedactionSessionKey = (conversationId = getConversationId()) => {
		return getPiiRedactionSessionStorageKey(botId, conversationId);
	};

	const loadPiiRedactionSession = () => {
		const key = getPiiRedactionSessionKey();
		piiRedactionSessionKeyRef.current = key;
		if (!key) return null;

		try {
			const raw = localStorage.getItem(key);
			if (!raw) return null;

			const session = readPiiRedactionSessionStorageEnvelope(
				JSON.parse(raw)
			);
			if (!session) {
				localStorage.removeItem(key);
				return null;
			}

			return session;
		} catch (error) {
			console.warn(
				'DOCSBOT: Failed to load the local PII redaction session.',
				error
			);
			localStorage.removeItem(key);
			return null;
		}
	};

	const savePiiRedactionSession = () => {
		if (!shouldRedactPii || !piiRedactionGuardRef.current) return;

		const session = exportPiiRedactionGuardSession(
			piiRedactionGuardRef.current
		);
		const envelope = createPiiRedactionSessionStorageEnvelope(session);
		if (!envelope) return;

		const key =
			piiRedactionSessionKeyRef.current || getPiiRedactionSessionKey();
		if (!key) return;

		try {
			localStorage.setItem(key, JSON.stringify(envelope));
			piiRedactionSessionKeyRef.current = key;
		} catch (error) {
			console.warn(
				'DOCSBOT: Failed to save the local PII redaction session.',
				error
			);
		}
	};

	const clearPiiRedactionSession = () => {
		const key =
			piiRedactionSessionKeyRef.current ||
			getPiiRedactionSessionStorageKey(botId, getStoredConversationId());
		if (key) {
			localStorage.removeItem(key);
		}
		piiRedactionSessionKeyRef.current = '';
	};

	const resetPiiRedactionGuard = () => {
		piiRedactionGuardRef.current = null;
		piiRedactionGuardPromiseRef.current = null;
		piiRedactionModeRef.current = null;
		piiRedactionBypassedRef.current = false;
		piiRedactionSessionKeyRef.current = '';
		setIsPiiRedactionLoading(false);
		setIsPiiRedactionOverrideAvailable(false);
		setIsPiiRedactionBypassed(false);
	};

	const getPiiRedactionGuard = async ({ allowBypass = false } = {}) => {
		if (!shouldRedactPii) return null;
		if (piiRedactionGuardRef.current) {
			return piiRedactionGuardRef.current;
		}

		if (!piiRedactionGuardPromiseRef.current) {
			setIsPiiRedactionLoading(true);
			const session = loadPiiRedactionSession();
			const guardOption =
				piiRedaction && typeof piiRedaction === 'object'
					? { ...piiRedaction, session }
					: { enabled: true, session };
			piiRedactionGuardPromiseRef.current =
				createPiiRedactionGuard(guardOption)
					.then((result) => {
						piiRedactionGuardRef.current = result?.guard || null;
						piiRedactionModeRef.current = result?.mode || null;
						if (!result?.guard) {
							console.warn(
								'DOCSBOT: PII redaction was requested, but this browser does not support the client-side redaction runtime.'
							);
						}
						return piiRedactionGuardRef.current;
					})
					.catch((error) => {
						console.warn(
							'DOCSBOT: Failed to initialize PII redaction. Sending the message without client-side redaction.',
							error
						);
						piiRedactionGuardRef.current = null;
						piiRedactionModeRef.current = null;
						return null;
					})
					.finally(() => {
						piiRedactionBypassedRef.current = false;
						setIsPiiRedactionLoading(false);
						setIsPiiRedactionOverrideAvailable(false);
						setIsPiiRedactionBypassed(false);
					});
		}

		if (allowBypass && piiRedactionBypassedRef.current) {
			return null;
		}

		return piiRedactionGuardPromiseRef.current;
	};

	const protectTextForRequest = async (text) => {
		if (!shouldRedactPii || typeof text !== 'string' || !text) {
			return text;
		}

		const guard = await getPiiRedactionGuard({ allowBypass: true });
		if (!guard) return text;

		try {
			const safe = await guard.protect(text);
			savePiiRedactionSession();
			return safe?.text || text;
		} catch (error) {
			console.warn(
				'DOCSBOT: Failed to redact message PII. Sending the original message.',
				error
			);
			return text;
		}
	};

	useEffect(() => {
		if (!isOpen || !shouldRedactPii || piiRedactionGuardRef.current) {
			return;
		}

		setIsPiiRedactionOverrideAvailable(false);
		piiRedactionBypassedRef.current = false;
		setIsPiiRedactionBypassed(false);
		void getPiiRedactionGuard();
	}, [isOpen, piiRedaction, shouldRedactPii]);

	const handlePiiRedactionBypass = () => {
		if (!showPiiRedactionStatus || !isPiiRedactionOverrideAvailable) {
			return;
		}

		piiRedactionBypassedRef.current = true;
		setIsPiiRedactionBypassed(true);
		void sendCurrentChatMessage();
	};

	const revealTextFromResponse = (text) => {
		if (
			!shouldRedactPii ||
			typeof text !== 'string' ||
			!piiRedactionGuardRef.current
		) {
			return text;
		}

		try {
			return piiRedactionGuardRef.current.reveal(text);
		} catch (error) {
			console.warn(
				'DOCSBOT: Failed to restore PII placeholders in the assistant response.',
				error
			);
			return text;
		}
	};

	const revealResponsePayload = (payload) => {
		if (!payload || typeof payload !== 'object') return payload;

		return {
			...payload,
			...(typeof payload.answer === 'string' && {
				answer: revealTextFromResponse(payload.answer)
			}),
			...(typeof payload.message === 'string' && {
				message: revealTextFromResponse(payload.message)
			}),
			...(Array.isArray(payload.history) && {
				history: revealHistoryFromResponse(payload.history)
			})
		};
	};

	const protectHistoryForRequest = async (history) => {
		if (!shouldRedactPii || !Array.isArray(history)) {
			return history;
		}

		return Promise.all(history.map(protectHistoryEntryForRequest));
	};

	const protectHistoryEntryForRequest = async (entry) => {
		if (typeof entry === 'string') {
			return protectTextForRequest(entry);
		}
		if (!entry || typeof entry !== 'object') {
			return entry;
		}

		const nextEntry = { ...entry };
		for (const key of ['content', 'message', 'answer', 'question']) {
			if (typeof nextEntry[key] === 'string') {
				nextEntry[key] = await protectTextForRequest(nextEntry[key]);
			}
		}
		return nextEntry;
	};

	const revealHistoryFromResponse = (history) => {
		if (!Array.isArray(history)) {
			return history;
		}

		return history.map(revealHistoryEntryFromResponse);
	};

	const revealHistoryEntryFromResponse = (entry) => {
		if (typeof entry === 'string') {
			return revealTextFromResponse(entry);
		}
		if (!entry || typeof entry !== 'object') {
			return entry;
		}

		const nextEntry = { ...entry };
		for (const key of ['content', 'message', 'answer', 'question']) {
			if (typeof nextEntry[key] === 'string') {
				nextEntry[key] = revealTextFromResponse(nextEntry[key]);
			}
		}
		return nextEntry;
	};

	const refreshChatHistory = async () => {
		if (streamController) {
			if (streamController.abort) {
				streamController.abort(); // If it's a fetch AbortController
			} else if (streamController.close) {
				streamController.close(); // If it's a WebSocket
			}

			setStreamController(null); // Clear the controller after aborting/closing
		}

		dispatch({ type: 'clear_messages' });
		localStorage.removeItem(`DocsBot_${botId}_chatHistory`);
		localStorage.removeItem(`DocsBot_${botId}_localChatHistory`);
		clearPiiRedactionSession();
		localStorage.removeItem(`DocsBot_${botId}_conversationId`);

		// Reset lead collection state so it can trigger again
		setLeadCollected(isLeadCollectionSatisfied());
		setIsLeadCaptureLocked(false);
		setPendingLeadCapture(null);
		resetPiiRedactionGuard();

		// Add first message after clearing
		if (labels.firstMessage) {
			dispatch({
				type: 'add_message',
				payload: {
					id: uuidv4(),
					variant: 'chatbot',
					message: labels.firstMessage,
					streaming: false,
					timestamp: Date.now()
				}
			});
		}
	};

	const shouldRequireLeadBeforeSend = () => {
		return (
			isLeadCollectEnabled() &&
			leadCollect?.mode === 'before_response' &&
			!isLeadCaptureLocked &&
			!leadCollected &&
			Array.isArray(leadCollect.fields) &&
			leadCollect.fields.length > 0
		);
	};

	useEffect(() => {
		if (!isLeadCollectEnabled()) {
			setLeadCollected(false);
			return;
		}
		setLeadCollected(isLeadCollectionSatisfied());
	}, [identify, leadCollect]);

	useEffect(() => {
		const addFirstMessage = async () => {
			if (Object.keys(stateMessagesRef.current || {}).length > 0) {
				return;
			}
			dispatch({
				type: 'add_message',
				payload: {
					id: uuidv4(),
					variant: 'chatbot',
					message: labels.firstMessage,
					streaming: false,
					timestamp: Date.now()
				}
			});
		};

		const fetchData = async () => {
			try {
				const savedConversationRaw = localStorage.getItem(
					`DocsBot_${botId}_chatHistory`
				);
				const savedConversation = savedConversationRaw
					? JSON.parse(savedConversationRaw)
					: null;

				const chatHistoryRaw = localStorage.getItem(
					`DocsBot_${botId}_localChatHistory`
				);
				const chatHistory = chatHistoryRaw
					? JSON.parse(chatHistoryRaw)
					: null;

				const currentTime = Date.now();
				let lastMsgTimeStamp = 0;
				if (savedConversation) {
					const convo = Object.values(savedConversation);
					// dont bother recreating the conversation if there is only one message (it's the first message)
					if (convo?.length > 1) {
						convo?.map((message, index) => {
							if (message?.timestamp > lastMsgTimeStamp) {
								lastMsgTimeStamp = message?.timestamp;
							}
						});
						if (currentTime - lastMsgTimeStamp > 12 * 60 * 60 * 1000) {
							refreshChatHistory();
						} else {
							dispatch({
								type: 'load_conversation',
								payload: {
									savedConversation:
										sanitizeRestoredConversation(
											savedConversation,
											{
												allowLeadCollect:
													isLeadCollectEnabled()
											}
										)
								}
							});
						}
					} else {
						await addFirstMessage();
					}
				} else if (labels.firstMessage) {
					//console.log(labels.firstMessage);
					await addFirstMessage();
				}

				if (chatHistory) {
					dispatch({
						type: 'save_history',
						payload: {
							chatHistory: chatHistory
						}
					});
				}

				//only focus on input if not mobile
				if (mediaMatch.matches && !isEmbeddedBox) {
					inputRef.current.focus();
				}
			} finally {
				hasRestoredConversationRef.current = true;
			}
		};

		fetchData();
	}, [labels.firstMessage]);

	useEffect(() => {
		if (!hasRestoredConversationRef.current) {
			return;
		}
		safeSetLocalStorageJson(
			`DocsBot_${botId}_chatHistory`,
			state.messages,
			{ trim: trimPersistedConversationMessages }
		);
	}, [state.messages]);

	useEffect(() => {
		if (hasRestoredConversationRef.current && state.chatHistory) {
			safeSetLocalStorageJson(
				`DocsBot_${botId}_localChatHistory`,
				state.chatHistory,
				{ trim: trimPersistedChatHistory }
			);
		}
	}, [state.chatHistory]);

	useEffect(() => {
		if (!isCalendlyEnabled) return;

		let cancelled = false;
		loadCalendlyWidgetScript()
			.then(() => {
				if (!cancelled) {
					setIsCalendlyScriptReady(true);
				}
			})
			.catch((error) => {
				console.warn('DOCSBOT: Failed to load Calendly widget', error);
			});

		return () => {
			cancelled = true;
		};
	}, [isCalendlyEnabled]);

	useEffect(() => {
		if (!isTidyCalEnabled) return;

		let cancelled = false;
		loadTidyCalWidgetScript()
			.then(() => {
				if (!cancelled) {
					setIsTidyCalScriptReady(true);
				}
			})
			.catch((error) => {
				console.warn('DOCSBOT: Failed to load TidyCal widget', error);
			});

		return () => {
			cancelled = true;
		};
	}, [isTidyCalEnabled]);

	async function fetchAnswer(question, image_urls = [], options = {}) {
		if (!options.bypassLeadCollect && shouldRequireLeadBeforeSend()) {
			setIsLeadCaptureLocked(true);
			setPendingLeadCapture({
				type: 'before_response',
				question,
				imageUrls: image_urls,
				audio: options.audio,
				audioUserMessageId: options.audioUserMessageId,
				trigger: false
			});
			const leadMessage = buildLeadFormMessage('before_response');
			if (leadMessage) {
				dispatch({
					type: 'add_message',
					payload: {
						...leadMessage,
						leadContext: {
							type: 'before_response',
							question,
							imageUrls: image_urls,
							audio: options.audio,
							audioUserMessageId: options.audioUserMessageId
						}
					}
				});
				scrollToBottom(ref);
				return;
			}
			setIsLeadCaptureLocked(false);
		}

		const id = uuidv4();
		const audio = typeof options.audio === 'string' ? options.audio : null;
		const audioUserMessageId = options.audioUserMessageId || null;
		setIsFetching(true);
		let answerId = null;

		requestIdCounterRef.current += 1;
		const requestId = requestIdCounterRef.current;
		activeRequestIdRef.current = requestId;

		const abortController = new AbortController();
		setStreamController(abortController);

		dispatch({
			type: 'add_message',
			payload: {
				id,
				variant: 'chatbot',
				message: null,
				loading: true,
				streaming: false,
				timestamp: Date.now()
			}
		});

		// Change this to use native JS event
		document.dispatchEvent(
			new CustomEvent('docsbot_fetching_answer', {
				detail: { question: audio ? null : question, audio: Boolean(audio) }
			})
		);

		let answer = '';
		let pendingSchedulerEmbed = null;
		let currentAgentActivity = null;
		let hasStartedStreaming = false;
		const safeQuestion = audio
			? question
			: await protectTextForRequest(question);
		// Use metadataOverride if provided (e.g. from lead form submission) to avoid
		// stale closure over identify that hasn't re-rendered yet.
		const metadata = options.metadataOverride || mergeIdentifyMetadata(identify);
		if (!Object.prototype.hasOwnProperty.call(metadata, 'referrer')) {
			metadata.referrer = window.location.href;
		}

		if (isAgent) {
			const sse_req = {
				stream: true,
				...(audio ? { audio } : { question: safeQuestion }),
				format: 'markdown',
				human_escalation: useEscalation ? true : false,
				followup_rating: useFeedback ? true : false,
				document_retriever: true,
				calendly: isCalendlyEnabled,
				calcom: isCalComEnabled,
				tidycal: isTidyCalEnabled,
				full_source: false,
				metadata,
				conversationId: getConversationId(),
				context_items: contextItems || 6,
				autocut: 2,
				default_language: browserRequestLanguageTag,
				image_urls:
					image_urls.length > 0 && useImageUpload
						? image_urls
						: undefined,
				...(signature &&
					reasoningEffort && {
						reasoning_effort: reasoningEffort
					}),
				...(useWebSearch && { web_search: true }),
				...(useCustomButtons && { custom_buttons: true })
			};

			// Track retry attempts - start at 0 so we get a total of 3 attempts (initial + 2 retries)
			let retryCount = 0;
			const MAX_RETRIES = 2;

			try {
				//console.log(sse_req);
				const apiUrl = localDev
					? `http://127.0.0.1:9000/teams/${teamId}/bots/${botId}/chat-agent`
					: `https://api.docsbot.ai/teams/${teamId}/bots/${botId}/chat-agent`;
				await fetchEventSource(apiUrl, {
					signal: abortController.signal,
					// Default false aborts SSE on tab blur and POSTs again on focus — skip that.
					openWhenHidden: true,
					headers: {
						'Content-Type': 'application/json',
						accept: 'application/json',
						// Set Authorization header if signature is provided
						...(signature && {
							Authorization: `Bearer ${signature}`
						})
					},
					method: 'POST',
					body: JSON.stringify(sse_req),
					async onopen(response) {
						// Check if the response is valid
						if (response.ok) {
							return; // Connection established successfully
						} else if (
							response.status >= 400 &&
							response.status < 500
						) {
							// All client-side errors (including 429) are not retriable
							let errorMessage = `HTTP error ${response.status}`;

							// Try to extract error message from response body
							try {
								const responseBody = await response.text();
								if (responseBody && responseBody.trim()) {
									try {
										const parsedBody =
											JSON.parse(responseBody);
										if (parsedBody && parsedBody.error) {
											errorMessage = parsedBody.error;
										}
									} catch (parseError) {
										// If we can't parse as JSON, use the raw response text
										errorMessage = responseBody.trim();
									}
								}
							} catch (e) {
								// If we can't read the response body, use the default error message
								console.error(
									'DOCSBOT: Failed to parse error response:',
									e
								);
							}

							// Create error with status code
							const error = new FatalError(errorMessage);
							error.status = response.status;
							throw error;
						} else {
							// Server errors or network issues should be retried
							throw new RetriableError(
								`HTTP error ${response.status}`
							);
						}
					},
					async onmessage(event) {
						const data = event;
						//console.log(data.event);

						// If server sends an error event, handle accordingly
							if (data.event === 'error') {
								const errorMessage =
									data.data ||
									'Sorry, something went wrong. Please try again.';
								if (audioUserMessageId) {
									dispatch({
										type: 'update_message',
										payload: {
											id: audioUserMessageId,
											loading: false
										}
									});
								}
								dispatch({
									type: 'update_message',
								payload: {
									id,
									variant: 'chatbot',
									type: data.event,
									message: errorMessage,
									loading: false,
									error: true,
									streaming: false,
									agentActivity: null
								}
							});
							currentAgentActivity = null;
							setIsFetching(false);
							scrollToBottom(ref);
							abortController.abort();
								return;
							}

							if (data.event === 'user_message') {
								if (!audioUserMessageId || !data.data) {
									return;
								}

								try {
									const userMessageData = JSON.parse(data.data);
									if (
										userMessageData?.source === 'audio' &&
										typeof userMessageData.message === 'string'
									) {
										dispatch({
											type: 'update_message',
											payload: {
												id: audioUserMessageId,
												message: userMessageData.message,
												loading: false
											}
										});
									}
								} catch (error) {
									console.warn(
										'DOCSBOT: Failed to parse user_message event',
										error
									);
								}
								return;
							}

							// Agent SSE: reasoning + tool_call use JSON `data`; stream uses plain text (see agentActivityFromSse.js)
							if (data.event === 'tool_call') {
							const toolCall = parseToolCallPayload(data.data);
							document.dispatchEvent(
								new CustomEvent('docsbot_tool_call', {
									detail: {
										name:
											typeof toolCall?.name === 'string'
												? toolCall.name
												: '',
										data: parseToolCallDataPayload(
											toolCall?.params
										)
									}
								})
							);
								const schedulerEmbedFromTool = resolveSchedulerEmbedForToolCall(
									toolCall,
									{
										calendly: isCalendlyEnabled,
										calcom: isCalComEnabled,
										tidycal: isTidyCalEnabled
									}
								);
								if (schedulerEmbedFromTool) {
									removeExistingSchedulerEmbeds(
										schedulerEmbedFromTool,
										id
									);
									pendingSchedulerEmbed = schedulerEmbedFromTool;
									dispatch({
										type: 'update_message',
									payload: {
										id,
										schedulerEmbed: pendingSchedulerEmbed
									}
								});
							}
							if (hasStartedStreaming) {
								return;
							}
							const activity = agentActivityFromSseEvent(
								'tool_call',
								data.data
							);
							if (
								activity &&
								showAgentActivity !== false
							) {
								currentAgentActivity = activity;
								dispatch({
									type: 'update_message',
									payload: { id, agentActivity: activity }
								});
							}
							return;
						}
						if (data.event === 'reasoning') {
							if (hasStartedStreaming) {
								return;
							}
							const isEmptyReasoning = isEmptyReasoningEvent(
								data.data
							);
							if (
								isEmptyReasoning &&
								currentAgentActivity?.kind === 'web_search'
							) {
								return;
							}
							const activity = agentActivityFromSseEvent(
								'reasoning',
								data.data
							);
							if (
								activity &&
								showAgentActivity !== false
							) {
								currentAgentActivity = activity;
								dispatch({
									type: 'update_message',
									payload: { id, agentActivity: activity }
								});
							}
							return;
						}

						if (data.event === 'stream') {
							hasStartedStreaming = true;
							// Handle empty data fields as line breaks to preserve formatting
							if (data.data === '') {
								answer += '\n';
							} else {
								answer += data.data;
							}
							const revealedAnswer =
								revealTextFromResponse(answer);
							dispatch({
								type: 'update_message',
								payload: {
									id,
									variant: 'chatbot',
									message: revealedAnswer,
									sources: null,
									loading: false,
									streaming: true,
									agentActivity: null
								}
							});
							currentAgentActivity = null;
						} else {
								if (data.data) {
									const rawFinalData = JSON.parse(data.data);
									const finalData =
										revealResponsePayload(rawFinalData);
										const isCustomButton =
											data.event === 'custom_button';
										const eventSchedulerEmbed =
											isCustomButton
												? null
												: resolveSchedulerEmbedForEventType(
														data.event,
														finalData,
														{
															calendly: isCalendlyEnabled,
															calcom: isCalComEnabled,
															tidycal: isTidyCalEnabled
														}
													);
										if (eventSchedulerEmbed) {
											removeExistingSchedulerEmbeds(
												eventSchedulerEmbed,
												id
											);
										}
										//console.log(finalData);

									const terminalMessage = isCustomButton
										? finalData.message || finalData.answer
										: finalData.answer;

									const finalMessageId =
										data.event ===
										'is_resolved_question'
											? uuidv4()
											: id;

									dispatch({
									type:
										data.event === 'is_resolved_question'
											? 'add_message'
											: 'update_message',
									payload: {
										id: finalMessageId,
										variant: 'chatbot',
										type: data.event,
										message: terminalMessage,
										...(isCustomButton && {
											customButton: {
												url: finalData.url,
												functionKey: finalData.functionKey,
												buttonText: finalData.buttonText,
												message: finalData.message,
												answer: finalData.answer
											}
										}),
										sources: finalData.sources || null,
										answerId:
											answerId || finalData.id || null, // use saved prev id for feedback button
										conversationId: getConversationId(),
										loading: false,
										streaming: false,
										responses: finalData.options || null,
										agentActivity: null,
										stripeBilling: finalData.stripeBilling || null,
										schedulerEmbed:
											pendingSchedulerEmbed ||
											eventSchedulerEmbed
									}
								});
								currentAgentActivity = null;

								answerId = finalData.id || null; // save the answer id for the feedback button
								let newChatHistory = finalData.history;

								dispatch({
									type: 'save_history',
									payload: {
										chatHistory: newChatHistory
									}
								});

								// Change this to use native JS event
								document.dispatchEvent(
									new CustomEvent(
										'docsbot_fetching_answer_complete',
										{ detail: finalData }
									)
								);
								setIsFetching(false);
							} else {
								console.warn(
									'DOCSBOT: Received empty data on message event',
									event
								);
							}
						}
					},
					onerror(err) {
						if (err instanceof FatalError) {
							throw err;
						}
						if (err instanceof RetriableError) {
							retryCount += 1;
							if (retryCount > MAX_RETRIES) {
								throw new FatalError(
									'Failed to connect after several attempts. Please try again later.'
								);
							}
							return Math.min(1000 * 2 ** retryCount, 10000);
						}
						// Only RetriableError opts into library retry; never use default ~1s retry.
						const message =
							err && typeof err.message === 'string' && err.message
								? err.message
								: 'The connection was interrupted.';
						const wrapped = new FatalError(message);
						if (err && typeof err.status === 'number') {
							wrapped.status = err.status;
						}
						throw wrapped;
					}
				});
				} catch (error) {
					console.error('DOCSBOT: Failed to fetch answer:', error);

				let errorMessage = 'Unknown error. Please try again later.';
				let isRateLimitError = false;
				if (error instanceof FatalError && error.message) {
					errorMessage = error.message;
					isRateLimitError = error.status === 429;
				} else if (error instanceof Error && error.message) {
					errorMessage = error.message;
					}

					if (audioUserMessageId) {
						dispatch({
							type: 'update_message',
							payload: {
								id: audioUserMessageId,
								loading: false
							}
						});
					}

					dispatch({
						type: 'update_message',
					payload: {
						id,
						variant: 'chatbot',
						message: errorMessage,
						loading: false,
						error: true,
						isRateLimitError,
						streaming: false,
						agentActivity: null
					}
				});
				currentAgentActivity = null;
				setIsFetching(false);
				scrollToBottom(ref);
			}
		} else {
			const history = await protectHistoryForRequest(
				state.chatHistory || []
			);
			const req = {
				question: safeQuestion,
				markdown: true,
				history,
				metadata,
				context_items: contextItems || 6,
				autocut: 2
			};
			if (signature) {
				req.auth = signature;
			}

			const apiUrl = localDev
				? `ws://127.0.0.1:9000/teams/${teamId}/bots/${botId}/chat`
				: `wss://api.docsbot.ai/teams/${teamId}/bots/${botId}/chat`;
			const ws = new WebSocket(apiUrl);
			setStreamController(ws);

			// Send message to server when connection is established
			ws.onopen = function (event) {
				ws.send(JSON.stringify(req));
			};

			ws.onerror = function (event) {
				console.error('DOCSBOT: WebSocket error', event);
				dispatch({
					type: 'update_message',
					payload: {
						id,
						variant: 'chatbot',
						message:
							'There was a connection error. Please try again.',
						loading: false,
						error: true,
						streaming: false
					}
				});
				if (activeRequestIdRef.current === requestId) {
					setIsFetching(false);
				}
			};

			ws.onclose = function (event) {
				if (!event.wasClean) {
					dispatch({
						type: 'update_message',
						payload: {
							id,
							message:
								'There was a network error. Please try again.',
							loading: false,
							error: true,
							streaming: false
						}
					});
				}
				if (activeRequestIdRef.current === requestId) {
					setIsFetching(false);
				}
				setStreamController((current) =>
					current === ws ? null : current
				);
			};

			// Receive message from server word by word. Display the words as they are received.
			ws.onmessage = async function (event) {
				const data = JSON.parse(event.data);
				if (data.sender === 'bot') {
					if (data.type === 'stream') {
						//append to answer
						answer += data.message;
						const revealedAnswer =
							revealTextFromResponse(answer);
						dispatch({
							type: 'update_message',
							payload: {
								id,
								variant: 'chatbot',
								message: revealedAnswer,
								sources: null,
								loading: false,
								streaming: true
							}
						});
					} else if (data.type === 'info') {
					} else if (data.type === 'end') {
						const rawFinalData = JSON.parse(data.message);
						const finalData = revealResponsePayload(rawFinalData);
						dispatch({
							type: 'update_message',
							payload: {
								id,
								variant: 'chatbot',
								message: finalData.answer,
								sources: finalData.sources,
								answerId: finalData.id,
								rating: finalData.rating,
								loading: false,
								streaming: false,
								stripeBilling: finalData.stripeBilling || null
							}
						});
						dispatch({
							type: 'save_history',
							payload: {
								chatHistory: finalData.history
							}
						});
						ws.close();
						// Change this to use native JS event
						document.dispatchEvent(
							new CustomEvent(
								'docsbot_fetching_answer_complete',
								{ detail: finalData }
							)
						);
						if (activeRequestIdRef.current === requestId) {
							setIsFetching(false);
						}
					} else if (data.type === 'error') {
						dispatch({
							type: 'update_message',
							payload: {
								id,
								variant: 'chatbot',
								message: data.message,
								loading: false,
								error: true,
								streaming: false
							}
						});
						ws.close();
						if (activeRequestIdRef.current === requestId) {
							setIsFetching(false);
						}
					}
				}
			};
		}
	}

	async function handleSubmit(event) {
		event.preventDefault();
		if (
			isPiiRedactionBlockingSend &&
			!isFetching &&
			!isRecordingAudio &&
			!isLeadFormVisible &&
			chatInput.trim().length >= minInputLength
		) {
			setIsPiiRedactionOverrideAvailable(true);
			return;
		}

		if (
			isFetching ||
			isPiiRedactionBlockingSend ||
			isRecordingAudio ||
			isLeadFormVisible ||
			chatInput.trim().length < minInputLength
		) {
			return;
		}

		sendCurrentChatMessage();
	}

	function sendCurrentChatMessage() {
		if (
			isFetching ||
			isRecordingAudio ||
			isLeadFormVisible ||
			chatInput.trim().length < minInputLength
		) {
			return;
		}

		// Extract thumbnails for history storage if images exist
		const historyImageUrls =
			useImageUpload && selectedImages.length > 0
				? selectedImages.map((img) => img.thumbnailUrl)
				: undefined;
		const userMessageId = uuidv4();

		dispatch({
			type: 'add_message',
			payload: {
				id: userMessageId,
				variant: 'user',
				message: chatInput,
				loading: false,
				timestamp: Date.now(),
				imageUrls: historyImageUrls
			}
		});

		// Add full-size image_urls to the API request if image upload is enabled
		fetchAnswer(chatInput, useImageUpload ? imageUrls : []);

		// Clear the input and images after sending
		setChatInput('');
		setSelectedImages([]);
		setImageUrls([]);

		scrollMessageToTopAfterRender(userMessageId);

		if (mediaMatch.matches) {
			inputRef.current?.focus();
		} else {
			inputRef.current?.blur();
		}
	}

	useEffect(() => {
		const root = document.documentElement;
		const defaultColor = '#1292EE';
		const primaryColor = color || defaultColor;
		const isWhite = ['#ffffff', '#FFFFFF', 'rgb(255, 255, 255)'].includes(
			color
		);

		root.style.setProperty(
			'--docsbot-color-main',
			isWhite ? '#314351' : primaryColor
		);

		root.style.setProperty('--docsbot-header--bg', primaryColor);
		root.style.setProperty(
			'--docsbot-header--color',
			decideTextColor(primaryColor)
		);

		root.style.setProperty('--docsbot-reset-button--bg', primaryColor);
		root.style.setProperty(
			'--docsbot-reset-button--color',
			decideTextColor(primaryColor)
		);

		root.style.setProperty(
			'--docsbot-user--bg',
			isWhite ? '#314351' : primaryColor
		);
		root.style.setProperty(
			'--docsbot-user--color',
			decideTextColor(isWhite ? '#314351' : primaryColor)
		);

		root.style.setProperty(
			'--docsbot-input--hover',
			isWhite ? '#314351' : primaryColor
		);

		root.style.setProperty('--docsbot-submit-button--bg', primaryColor);
		root.style.setProperty(
			'--docsbot-submit-button--color',
			decideTextColor(primaryColor)
		);

		root.style.setProperty(
			'--docsbot-logo--color',
			isWhite ? '#314351' : primaryColor
		);

		// Add image upload button styles
		root.style.setProperty(
			'--docsbot-image-upload-btn--color',
			isWhite ? '#314351' : primaryColor
		);

		// Add drag-and-drop zone styles
		root.style.setProperty(
			'--docsbot-drag-border-color',
			isWhite ? '#314351' : primaryColor
		);
		root.style.setProperty(
			'--docsbot-focus-ring',
			isWhite ? '#314351' : primaryColor
		);
	}, [color]);

	const [parsedFooterText, setParsedFooterText] = useState(null);

	const syncAtBottom = () => {
		const chatContainer = ref.current;
		if (!chatContainer) return;
		const effectiveScrollHeight =
			chatContainer.scrollHeight - bottomScrollSpacerHeight;
		const atBottom =
			chatContainer.scrollTop + chatContainer.offsetHeight >=
			effectiveScrollHeight - 1;
		setIsAtBottom(atBottom);
	};

	const scrollToLatestContent = () => {
		const chatContainer = ref.current;
		if (!chatContainer) return;
		chatContainer.scrollTop =
			chatContainer.scrollHeight -
			bottomScrollSpacerHeight -
			chatContainer.clientHeight;
	};

	useEffect(() => {
		const chatContainer = ref.current;

		if (chatContainer) {
			chatContainer.addEventListener('scroll', syncAtBottom);
			syncAtBottom();
		}

		return () => {
			if (chatContainer) {
				chatContainer.removeEventListener('scroll', syncAtBottom);
			}
		};
	}, [bottomScrollSpacerHeight]);

	useLayoutEffect(() => {
		syncAtBottom();
	}, [bottomScrollSpacerHeight, state.messages]);

	useLayoutEffect(() => {
		if (!anchoredTopScrollMessageId) return;

		const topScrollGap = 16;

		let frameId = null;
		let attempts = 0;
		const maxAttempts = 3;

		const scrollWhenReady = () => {
			const messageRef =
				messagesRefs.current[anchoredTopScrollMessageId];
			const container = ref.current;
			const messageEl = messageRef?.current;
			if (container && messageEl) {
				const shouldUseBottomSpacer =
					!isEmbeddedBox || !isEmbeddedAutoHeightHost();
				if (
					isEmbeddedBox &&
					shouldUseBottomSpacer &&
					anchoredTopScrollClientHeightRef.current === null
				) {
					anchoredTopScrollClientHeightRef.current =
						container.clientHeight;
				}
				const containerRect = container.getBoundingClientRect();
				const messageRect = messageEl.getBoundingClientRect();
				const targetScrollTop = Math.max(
					0,
					container.scrollTop +
						messageRect.top -
						containerRect.top -
						topScrollGap
				);
				const scrollHeightWithoutSpacer =
					container.scrollHeight - bottomScrollSpacerHeight;
				const effectiveClientHeight =
					isEmbeddedBox &&
					anchoredTopScrollClientHeightRef.current !== null
						? anchoredTopScrollClientHeightRef.current
						: container.clientHeight;
				const neededSpacerHeight = Math.max(
					0,
					shouldUseBottomSpacer
						? Math.min(
								effectiveClientHeight,
								Math.ceil(
									targetScrollTop +
										effectiveClientHeight -
										scrollHeightWithoutSpacer
								)
							)
						: 0
				);

				if (neededSpacerHeight !== bottomScrollSpacerHeight) {
					setBottomScrollSpacerHeight(neededSpacerHeight);
					frameId = window.requestAnimationFrame(scrollWhenReady);
					return;
				}

				if (pendingTopScrollMessageId === anchoredTopScrollMessageId) {
					container.scrollTop = targetScrollTop;
					setPendingTopScrollMessageId(null);
				}
				return;
			}

			attempts += 1;
			if (attempts < maxAttempts) {
				frameId = window.requestAnimationFrame(scrollWhenReady);
			}
		};

		frameId = window.requestAnimationFrame(scrollWhenReady);

		return () => {
			if (frameId !== null) {
				window.cancelAnimationFrame(frameId);
			}
		};
	}, [
		anchoredTopScrollMessageId,
		bottomScrollSpacerHeight,
		isEmbeddedBox,
		pendingTopScrollMessageId,
		state.messages
	]);

	useEffect(() => {
		if (isFetching) return;
		setAnchoredTopScrollMessageId(null);
		setPendingTopScrollMessageId(null);
		setBottomScrollSpacerHeight(0);
		anchoredTopScrollClientHeightRef.current = null;
	}, [isFetching]);

	useEffect(() => {
		if (labels.footerMessage) {
			setParsedFooterText(labels.footerMessage);
		} else {
			setParsedFooterText(null);
		}
	}, [labels.footerMessage]);

	const isWhite = ['#ffffff', '#FFFFFF', 'rgb(255, 255, 255)'].includes(
		color
	);
	const isFloatingSmall = !isEmbeddedBox && hideHeader;
	const chatRegionLabel = botName || labels.floatingButton;
	const visibleMessageKeys = getVisibleMessageKeys(state.messages);

	useEffect(() => {
		if (isOpen) {
			setTimeout(() => scrollToBottom(ref), 0);
		}
	}, [isOpen]);

	useEffect(() => {
		if (isEmbeddedBox || typeof setIsOpen !== 'function') return;

		const handleEscape = (event) => {
			if (event.key === 'Escape') {
				setIsOpen(false);
			}
		};

		document.addEventListener('keydown', handleEscape);
		return () => {
			document.removeEventListener('keydown', handleEscape);
		};
	}, [isEmbeddedBox, setIsOpen]);

	// Handle drag and drop events
	const handleDragEnter = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	};

	const handleDragLeave = (e) => {
		e.preventDefault();
		e.stopPropagation();

		// Only reset isDragging if we're leaving the target element
		// and not entering a child element of the target
		if (!e.currentTarget.contains(e.relatedTarget)) {
			setIsDragging(false);
		}
	};

	const handleDragOver = (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (!isDragging) setIsDragging(true);
	};

	const handleDrop = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);

		const files = Array.from(e.dataTransfer.files);

		// Check if all files are images
		const allImages = files.every((file) => file.type.startsWith('image/'));

		if (files.length > 0 && !allImages) {
			console.warn('DOCSBOT: Only image files are allowed');
			return;
		}

		processImageFiles(files);
	};

	return (
		<div
			className={clsx(
				alignment === 'left' ? 'docsbot-left' : '',
				'docsbot-wrapper',
				isEmbeddedBox ? 'docsbot-embedded' : 'docsbot-floating'
			)}
			style={
				mediaMatch.matches
					? {
							left:
								alignment === 'left'
									? horizontalMargin || 20
									: 'auto',
							right:
								alignment === 'right'
									? horizontalMargin || 20
									: 'auto',
							bottom: verticalMargin ? verticalMargin + 80 : 100
						}
					: {}
			}
			part="wrapper"
		>
			<section
				className="docsbot-chat-container"
				id={chatPanelId}
				aria-label={chatRegionLabel}
			>
				<div className="docsbot-chat-inner-container">
					{!isEmbeddedBox && (
						<button
							type="button"
							className={'mobile-close-button'}
							onClick={(e) => {
								e.preventDefault();
								setIsOpen(false);
							}}
							aria-controls={chatPanelId}
							aria-label={labels.close}
						>
							<FontAwesomeIcon size="lg" icon={faXmark} />
							<span className="mobile-close-button-label">
								{labels.close}
							</span>
						</button>
					)}
					<div
						className={clsx(
							'docsbot-chat-header',
							isEmbeddedBox && hideHeader && 'unbranded',
							hasConversationStarted && 'is-small'
						)}
						data-shadow={
							isWhite &&
							(isFloatingSmall || !isEmbeddedBox || isEmbeddedBox)
						}
					>
						<div
							className="docsbot-chat-header-inner"
							style={{ width: '100%' }}
						>
							<button
								type="button"
								onClick={() => refreshChatHistory()}
								className="docsbot-chat-header-button"
								aria-label={labels?.resetChat}
							>
								<FontAwesomeIcon icon={faRefresh} />
							</button>
							<div
								className="docsbot-chat-header-content"
								style={{
									textAlign:
										headerAlignment === 'left'
											? 'left'
											: 'center'
								}}
							>
								{!(isEmbeddedBox && hideHeader) &&
									(logo ? (
										<div
											className="docsbot-chat-header-branded"
											style={{
												justifyContent:
													headerAlignment === 'left'
														? 'start'
														: 'center'
											}}
										>
											<img src={logo} alt={botName} />
										</div>
									) : (
										<>
											<h1 className="docsbot-chat-header-title">
												{botName}
											</h1>
											<span className="docsbot-chat-header-subtitle">
												{description}
											</span>
										</>
									))}
							</div>
							{!isEmbeddedBox && (
								<div className="docsbot-chat-header-background-wrapper">
									<div
										className="docsbot-chat-header-background"
										data-shadow="true"
									/>
								</div>
							)}
						</div>
					</div>

					<div
						className="docsbot-chat-message-container"
						ref={ref}
						role="log"
						aria-live="polite"
						aria-relevant="additions text"
						aria-busy={isFetching ? 'true' : 'false'}
						aria-label={chatRegionLabel}
					>
						{visibleMessageKeys.map((key, index) => {
							const message = state.messages[key];
							message.isLast =
								key === visibleMessageKeys[visibleMessageKeys.length - 1];
							if (
								message.id &&
								!messagesRefs.current[message.id]
							) {
								messagesRefs.current[message.id] = createRef();
							}
							
							return message.variant === 'chatbot' ? (
								<div key={key}>
									{message.type === 'lead_collect' ? (
										<LeadCollectBlock message={message}>
											{(ready) => (
												<>
													<BotChatMessage
														payload={{
															...message,
															type: 'lead_collect_message',
															message: message.message,
															leadForm: undefined,
															loading: !ready,
															conversationId: getConversationId()
														}}
														messageBoxRef={
															messagesRefs.current[message.id]
														}
														chatContainerRef={ref}
														fetchAnswer={fetchAnswer}
														inputRef={inputRef}
														onLeadCollectSubmit={() => {}}
														onLeadCollectRequest={() => false}
														onLeadCollectEscalated={() => {}}
														onLeadCollectCancel={() => {}}
														leadCollectMode={leadCollect?.mode}
														pendingLeadCapture={pendingLeadCapture}
													/>
													{ready && (
													<LeadCollectMessage
														payload={{
															...message,
															conversationId: getConversationId()
														}}
														messageBoxRef={
															messagesRefs.current[message.id]
														}
														onLeadCollectSubmit={(data, event) =>
															handleLeadCollectSubmit(
																message,
																data,
																event
															)
														}
												onLeadCollectCancel={() => {
													setPendingLeadCapture(null);
													setIsLeadCaptureLocked(false);
												}}
											/>
													)}
												</>
											)}
										</LeadCollectBlock>
									) : (
										<BotChatMessage
											payload={{
												...message,
												conversationId: getConversationId() //lets us escalate historic conversations
											}}
											messageBoxRef={
												messagesRefs.current[message.id]
											}
											chatContainerRef={ref}
											fetchAnswer={fetchAnswer}
											inputRef={inputRef}
											onLeadCollectSubmit={(data, event) =>
												handleLeadCollectSubmit(
													message,
													data,
													event
												)
											}
											onLeadCollectRequest={(data) => {
												if (
													leadCollect?.mode !==
													'before_escalation'
												) {
													return false;
												}
												if (leadCollected) {
													return false;
												}

												const leadMessage =
													buildLeadFormMessage(
														'before_escalation'
													);
												if (!leadMessage) return false;

												setPendingLeadCapture({
													type: 'support',
													history:
														data?.history ||
														state.chatHistory ||
														[],
													trigger: false
												});
												dispatch({
													type: 'add_message',
													payload: {
														...leadMessage,
														leadContext: {
															type: 'support',
															history:
																data?.history ||
																state.chatHistory ||
																[]
														}
													}
												});
												scrollToBottom(ref);
												return true;
											}}
											onLeadCollectEscalated={() => {
												setPendingLeadCapture(null);
												setIsLeadCaptureLocked(false);
											}}
											onLeadCollectCancel={() => {
												setPendingLeadCapture(null);
												setIsLeadCaptureLocked(false);
											}}
											onSchedulerBookingMetadata={async (
												metadata
											) => {
												if (
													!metadata ||
													typeof metadata !==
														'object'
												) {
													return;
												}
												updateIdentity({
													metadata
												});
												await updateConversationMetadata(
													metadata
												);
											}}
											leadCollectMode={leadCollect?.mode}
											pendingLeadCapture={pendingLeadCapture}
											isCalendlyScriptReady={
												isCalendlyScriptReady
											}
											isTidyCalScriptReady={
												isTidyCalScriptReady
											}
										/>
									)}
									{message?.options ? (
										<Options
											key={key + 'opts'}
											options={message.options}
										/>
									) : null}
								</div>
							) : (
								<UserChatMessage
									key={key}
										loading={message.loading}
										message={message.message}
										imageUrls={message.imageUrls}
										audio={message.audio}
										messageBoxRef={
											messagesRefs.current[message.id]
										}
								/>
							);
						})}

						{visibleMessageKeys.length <= 1 &&
							Object.keys(questions).length >= 1 && (
								<div
									className={clsx(
										'docsbot-chat-suggested-questions-container consecutive-bot-message',
										botIcon && 'has-avatar'
									)}
								>
								<span className="docsbot-chat-suggested-questions-title bg-slate-100 text-slate-800">
									{labels.suggestions}
								</span>
									<div className="docsbot-chat-suggested-questions-grid">
										{Object.keys(questions).map((index) => {
											const suggestion = questions[index];
											const prompt =
												typeof suggestion === 'string'
													? suggestion
													: suggestion?.question;
											const chipLabel =
												typeof suggestion === 'string'
													? suggestion
													: suggestion?.label ?? prompt;
											return (
												<button
													key={'question' + index}
													type="button"
													dir="auto"
													onClick={() => {
														const messageId = uuidv4();
														dispatch({
															type: 'add_message',
															payload: {
																id: messageId,
																variant: 'user',
																message: prompt,
																loading: false,
																timestamp:
																	Date.now()
															}
														});
														fetchAnswer(prompt);
														setChatInput('');
														scrollMessageToTopAfterRender(
															messageId
														);
														if (mediaMatch.matches) {
															inputRef.current?.focus();
														} else {
															inputRef.current?.blur();
														}
													}}
													className="docsbot-chat-suggested-questions-button"
												>
													{chipLabel}
												</button>
											);
										})}
									</div>
								</div>
							)}

						{bottomScrollSpacerHeight > 0 && (
							<div
								aria-hidden="true"
								style={{
									height: bottomScrollSpacerHeight,
									marginTop: 0,
									pointerEvents: 'none'
								}}
							/>
						)}
					</div>

					<div className="docsbot-chat-footer">
						{!isAtBottom && (
							<button
								type="button"
								className={clsx(
									'docsbot-scroll-button',
									isAtBottom && 'hide'
								)}
								onClick={scrollToLatestContent}
								aria-label="Scroll to latest messages"
							>
								<FontAwesomeIcon icon={faChevronDown} />
							</button>
						)}

							<div className="docsbot-chat-footer-inner-wrapper">
								<div className="docsbot-chat-input-container">
									{showPiiRedactionStatus && (
										<div
											className={clsx(
												'docsbot-privacy-protection-status',
												isPiiRedactionBypassed &&
													'is-bypassed'
											)}
											role="status"
											aria-live="polite"
										>
											<div
												className="docsbot-privacy-protection-loader"
												aria-hidden="true"
											>
												<Loader />
											</div>
											<div className="docsbot-privacy-protection-copy">
												<strong>
													{
														labels.privacyProtectionLoading
													}
												</strong>
												<span>
													{isPiiRedactionBypassed
														? labels.privacyProtectionBypassWarning
														: labels.privacyProtectionLoadingDetail}
												</span>
											</div>
											{isPiiRedactionOverrideAvailable &&
												!isPiiRedactionBypassed && (
													<button
														type="button"
														className="docsbot-privacy-protection-bypass"
														onClick={handlePiiRedactionBypass}
													>
														{
															labels.privacyProtectionSendAnyway
														}
													</button>
												)}
										</div>
									)}
									<form
										className={`docsbot-chat-input-form ${chatInput.trim().length < minInputLength || isFetching || isRecordingAudio || isLeadFormVisible ? 'has-disabled-submit' : ''} ${isRecordingAudio ? 'is-recording-audio' : ''}`}
									onSubmit={handleSubmit}
									onDragEnter={
										useImageUpload ? handleDragEnter : null
									}
									onDragLeave={
										useImageUpload ? handleDragLeave : null
									}
									onDragOver={
										useImageUpload ? handleDragOver : null
									}
									onDrop={useImageUpload ? handleDrop : null}
								>
									{/* Hidden file input */}
									{useImageUpload && (
										<input
											type="file"
											ref={fileInputRef}
											onChange={handleImageSelect}
											accept="image/*"
											multiple
											className="docsbot-hidden-file-input"
											aria-label="Upload image"
											tabIndex={-1}
											/>
										)}

										{isRecordingAudio && (
											<div
												className="docsbot-audio-recorder-overlay"
												role="group"
												aria-label={labels.audioRecord}
											>
												<button
													type="button"
													className="docsbot-audio-recorder-cancel"
													onClick={() =>
														stopAudioRecording({
															send: false
														})
													}
													aria-label={labels.cancel}
												>
													<FontAwesomeIcon
														icon={faXmark}
													/>
												</button>
												<div className="docsbot-audio-recorder-visual">
													<span className="docsbot-audio-recorder-time">
														{formatAudioRecordingTime(
															audioRecordingElapsedMs
														)}
													</span>
													<div
														className="docsbot-audio-recorder-wave"
														aria-hidden="true"
													>
														{audioWaveformLevels.map((level, index) => (
															<span
																key={index}
																style={{
																	height: `${Math.round(
																		2 +
																			level *
																				18
																	)}px`,
																	opacity:
																		0.42 +
																		level * 0.5
																}}
															/>
														))}
													</div>
												</div>
												<button
													type="button"
													className="docsbot-audio-recorder-send"
													onClick={() =>
														stopAudioRecording({
															send: true
														})
													}
													aria-label={labels.submit}
												>
													<FontAwesomeIcon
														icon={faCheck}
													/>
												</button>
											</div>
										)}

										<div
										className={`docsbot-chat-input-wrapper ${selectedImages.length > 0 ? 'has-images' : ''} ${isDragging ? 'is-dragging' : ''} ${!useImageUpload && !isAudioUploadEnabled ? 'no-media-upload' : ''} ${useImageUpload && isAudioUploadEnabled && showAudioRecordButton ? 'has-image-audio-upload' : ''}`}
									>
										<label
											id={chatInputLabelId}
											htmlFor={chatInputId}
											className="docsbot-screen-reader-only"
										>
											{labels.inputPlaceholder}
										</label>
										<textarea
											id={chatInputId}
											className={`docsbot-chat-input ${!useImageUpload && !isAudioUploadEnabled ? 'no-media-upload' : ''} ${useImageUpload && isAudioUploadEnabled && showAudioRecordButton ? 'has-image-audio-upload' : ''}`}
											placeholder={
												labels.inputPlaceholder
											}
											value={chatInput}
											onFocus={(e) => {
												const textarea = e.target;
												const form =
													textarea.parentNode
														.parentNode;
												const container =
													form.parentNode;

												container.classList.add(
													'focused'
												);
											}}
											onBlur={(e) => {
												const textarea = e.target;
												const form =
													textarea.parentNode
														.parentNode;
												const container =
													form.parentNode;

												container.classList.remove(
													'focused'
												); // remove focused class
											}}
											onChange={(e) => {
												setChatInput(e.target.value);

												e.target.style.height = 'auto';

												// get the computed style of the textarea
												const computed =
													window.getComputedStyle(
														e.target
													);
												const padding =
													parseInt(
														computed.paddingTop
													) +
													parseInt(
														computed.paddingBottom
													);

												if (
													e.target.scrollHeight > 54
												) {
													e.target.style.height =
														e.target.scrollHeight -
														padding +
														'px';
												}
											}}
											onKeyDown={(e) => {
												//this detects if the user is typing in a IME session (ie Kanji autocomplete) to avoid premature submission
												if (
													e.isComposing ||
													e.keyCode === 229
												) {
													return;
												}
												if (
													e.key === 'Enter' &&
													!e.shiftKey
												) {
													handleSubmit(e);
													e.target.style.height =
														'auto';
												}
											}}
											onPaste={(e) => {
												if (!useImageUpload) return;

												const clipboardItems =
													e.clipboardData.items;
												const imageItems = Array.from(
													clipboardItems
												).filter((item) =>
													item.type.startsWith(
														'image/'
													)
												);

												if (imageItems.length > 0) {
													e.preventDefault();

													// Process only one image if multiple are pasted
													// For simplicity, we're just handling the first image
													const item = imageItems[0];

													// Convert clipboard item to a file
													const blob =
														item.getAsFile();
													if (blob) {
														// Check if we'd exceed the limit
														if (
															selectedImages.length >=
															2
														) {
															console.warn(
																'DOCSBOT: Maximum 2 images allowed'
															);
															return;
														}

														// Process the pasted image file
														processImageFiles([
															blob
														]);
													}
												}
											}}
											ref={inputRef}
											disabled={
												isLeadFormVisible ||
												isRecordingAudio
											}
											aria-labelledby={chatInputLabelId}
											maxLength={
												inputLimit
													? Math.min(inputLimit, 2000)
													: 500
											}
											rows={1}
										/>
										{selectedImages.length > 0 && (
											<div className="docsbot-image-preview-container">
												{selectedImages.map(
													(image, index) => (
														<div
															key={index}
															className="docsbot-image-preview"
														>
															<img
																src={image.url}
																alt={`Selected ${index + 1}`}
																className="docsbot-image-preview-img"
															/>
															<button
																type="button"
																onClick={() =>
																	removeImage(
																		index
																	)
																}
																className="docsbot-image-remove-btn"
																aria-label="Remove image"
															>
																<FontAwesomeIcon
																	icon={
																		faTimes
																	}
																/>
															</button>
														</div>
													)
												)}
											</div>
										)}
									</div>

									{/* Image upload button - only show when useImageUpload is true */}
									{useImageUpload && (
										<button
											type="button"
											onClick={triggerFileInput}
											className="docsbot-image-upload-btn"
											disabled={
												selectedImages.length >= 2 ||
												isFetching ||
												isPiiRedactionLoading ||
												isRecordingAudio ||
												isLeadFormVisible
											}
											aria-label="Upload image"
										>
											<FontAwesomeIcon icon={faImage} />
										</button>
									)}

									{showAudioRecordButton && (
										<button
											type="button"
											onClick={handleAudioButtonClick}
											className="docsbot-audio-record-btn"
											disabled={
												isFetching ||
												isPiiRedactionLoading ||
												isLeadFormVisible
											}
											aria-label={labels.audioRecord}
										>
											<FontAwesomeIcon
												icon={faMicrophone}
											/>
										</button>
									)}

									<button
										type="submit"
										className="docsbot-chat-btn-send"
										{...([
											'#ffffff',
											'#FFFFFF',
											'rgb(255, 255, 255)'
										].includes(color) && {
											style: { fill: 'inherit' }
										})}
											disabled={
												chatInput.trim().length <
													minInputLength ||
												isFetching ||
												isRecordingAudio ||
												isLeadFormVisible
											}
										aria-label={labels.submit}
									>
										<FontAwesomeIcon
											icon={faPaperPlane}
											className="docsbot-chat-btn-send-icon"
											aria-hidden="true"
										/>
									</button>
								</form>
							</div>

							{(branding || parsedFooterText?.trim()) && (
								<div className="docsbot-chat-credits">
									{parsedFooterText?.trim() &&
										(keepFooterVisible ||
											Object.keys(state.messages)
												.length <= 1) && (
											<Suspense fallback={null}>
												<LazyStreamdown
													className={clsx(
														'docsbot-chat-credits--policy',
														'docsbot-streamdown'
													)}
													allowedDomains={allowedDomains}
													linkSafetyEnabled={linkSafetyEnabled}
													mode="static"
												>
													{parsedFooterText}
												</LazyStreamdown>
											</Suspense>
										)}

									{branding && (
										<a
											href="https://docsbot.ai?utm_source=chatbot&utm_medium=chatbot&utm_campaign=chatbot"
											target="_blank"
											rel="noopener"
											aria-label={
												labels.poweredBy + ' DocsBot'
											}
										>
											<span aria-hidden="true">
												{labels.poweredBy}
											</span>
											<DocsBotLogo
												aria-hidden="true"
												className="docsbot-logo"
											/>
										</a>
									)}
								</div>
							)}
						</div>
					</div>
				</div>
			</section>
		</div>
	);
};
