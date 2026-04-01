import { useState, useEffect, useRef, Suspense } from 'react';
import { Loader } from '../loader/Loader';
import { useConfig } from '../configContext/ConfigContext';
import { BotAvatar } from '../botAvatar/BotAvatar';
import { Source } from '../source/Source';
import { CheckIcon } from '../icons/CheckIcon';
import { CopyIcon } from '../icons/CopyIcon';
import { useChatbot } from '../chatbotContext/ChatbotContext';
import { scrollToBottom, mergeIdentifyMetadata } from '../../utils/utils';
import clsx from 'clsx';
import { LazyStreamdown } from '../streamdown/LazyStreamdown';
import { preprocessMath } from '../../utils/markdown';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
	faBrain,
	faCalendarDays,
	faMagnifyingGlass,
	faVial,
	faGlobe
} from '@fortawesome/free-solid-svg-icons';
import {
	faCreditCard,
	faFileCode
} from '@fortawesome/free-regular-svg-icons';

import { StripeBilling } from '../stripeBilling/StripeBilling';
import { CalendlyEmbed } from '../calendlyEmbed/CalendlyEmbed';
import { CalComEmbed } from '../calComEmbed/CalComEmbed';
import { TidyCalEmbed } from '../tidyCalEmbed/TidyCalEmbed';

/**
 * Config `labels` keys when agent activity uses configKey (all tools except reasoning).
 * Fallback when configKey is missing (legacy).
 */
const AGENT_ACTIVITY_CONFIG_LABEL_KEYS = {
	reasoning: 'agentActivityThinking',
	web_search: 'agentActivityWebSearch',
	code_interpreter: 'agentActivityCodeInterpreter',
	search_docs: 'agentActivitySearchDocumentation',
	stripe: 'agentActivityTool', // unmapped stripe_* fallback
	booking: 'agentActivityTool',
	tool: 'agentActivityTool'
};

function iconForAgentActivity(kind) {
	switch (kind) {
		case 'reasoning':
			return faBrain;
		case 'search_docs':
			return faMagnifyingGlass;
		case 'web_search':
			return faGlobe;
		case 'booking':
			return faCalendarDays;
		case 'code_interpreter':
			return faFileCode;
		case 'stripe':
			return faCreditCard;
		default:
			return faVial;
	}
}

function resolveAgentActivityLabel(agentActivity, labels) {
	const baseLabel = resolveBaseAgentActivityLabel(agentActivity, labels);
	if (!baseLabel || agentActivity?.kind !== 'web_search') {
		return { text: baseLabel, segments: [] };
	}

	const actionType = agentActivity.webSearchActionType;
	if (actionType === 'search' && agentActivity.webSearchQuery) {
		return buildActivityLabelSegments({
			template: labels?.agentActivityWebSearchQuery || '',
			replacements: {
				query: agentActivity.webSearchQuery
			}
		});
	}
	if (actionType === 'open_page' && agentActivity.webSearchUrl) {
		return buildActivityLabelSegments({
			template: labels?.agentActivityWebSearchOpeningPage || '',
			replacements: {
				url: compactActivityUrl(agentActivity.webSearchUrl)
			}
		});
	}
	if (
		actionType === 'find_in_page' &&
		(agentActivity.webSearchUrl || agentActivity.webSearchPattern)
	) {
		return buildActivityLabelSegments({
			template: labels?.agentActivityWebSearchSearchingPage || '',
			replacements: {
				url: compactActivityUrl(agentActivity.webSearchUrl),
				pattern: agentActivity.webSearchPattern
			}
		});
	}

	return { text: baseLabel, segments: [] };
}

function resolveBaseAgentActivityLabel(agentActivity, labels) {
	if (agentActivity.label != null && agentActivity.label !== '') {
		return agentActivity.label;
	}
	const key =
		agentActivity.configKey ||
		AGENT_ACTIVITY_CONFIG_LABEL_KEYS[agentActivity.kind];
	if (key && labels && labels[key]) {
		return labels[key];
	}
	return '';
}

function compactActivityUrl(urlString) {
	if (!urlString || typeof urlString !== 'string') return '';
	try {
		const parsed = new URL(urlString);
		const hostname = parsed.hostname.replace(/^www\./i, '');
		const pathname = parsed.pathname === '/' ? '' : parsed.pathname;
		const compact = `${hostname}${pathname}`;
		if (compact.length <= 60) return compact;
		return `${compact.slice(0, 57)}...`;
	} catch {
		const compact = urlString.trim();
		if (compact.length <= 60) return compact;
		return `${compact.slice(0, 57)}...`;
	}
}

function buildActivityLabelSegments({ template, replacements = {} }) {
	const safeTemplate =
		typeof template === 'string' && template.trim()
			? template
			: '';
	if (!safeTemplate) {
		return { text: '', segments: [] };
	}

	const segments = [];
	const tokenRegex = /\{([a-zA-Z0-9_]+)\}/g;
	let lastIndex = 0;
	let match;

	while ((match = tokenRegex.exec(safeTemplate)) !== null) {
		const matchStart = match.index;
		const matchEnd = tokenRegex.lastIndex;
		const tokenName = match[1];

		if (matchStart > lastIndex) {
			segments.push({
				text: safeTemplate.slice(lastIndex, matchStart),
				isParam: false
			});
		}

		const rawValue =
			typeof replacements[tokenName] === 'string'
				? replacements[tokenName].trim()
				: '';

		if (rawValue) {
			const faviconSrc =
				tokenName === 'url'
					? googleFaviconForActivityValue(rawValue)
					: '';
			segments.push({
				text: truncateActivityParam(rawValue),
				full: rawValue,
				isParam: true,
				faviconSrc,
				tokenName
			});
		}

		lastIndex = matchEnd;
	}

	if (lastIndex < safeTemplate.length) {
		segments.push({
			text: safeTemplate.slice(lastIndex),
			isParam: false
		});
	}

	// Normalize whitespace around dropped placeholders.
	const collapsedText = segments
		.map((segment) => segment.text)
		.join('')
		.replace(/\s{2,}/g, ' ')
		.trim();
	if (!collapsedText) {
		return { text: '', segments: [] };
	}

	return { text: '', segments };
}

function truncateActivityParam(value, maxLength = 60) {
	if (typeof value !== 'string') return '';
	const trimmed = value.trim();
	if (trimmed.length <= maxLength) {
		return trimmed;
	}
	return `${trimmed.slice(0, maxLength - 1)}…`;
}

function googleFaviconForActivityValue(value) {
	if (typeof value !== 'string' || !value.trim()) return '';
	const normalized = value.trim();
	try {
		const parsed = new URL(
			/^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`
		);
		const hostname = parsed.hostname?.replace(/^www\./i, '');
		if (!hostname) return '';
		return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=16`;
	} catch {
		return '';
	}
}

export const BotChatMessage = ({
	payload,
	messageBoxRef,
	fetchAnswer,
	chatContainerRef,
	inputRef,
	onLeadCollectSubmit,
	onLeadCollectRequest,
	onLeadCollectEscalated,
	onLeadCollectCancel,
	onSchedulerBookingMetadata,
	leadCollectMode,
	pendingLeadCapture,
	isCalendlyScriptReady,
	isTidyCalScriptReady
}) => {
	const [rating, setRating] = useState(payload.rating || 0);
	const [ratingSubmitted, setRatingSubmitted] = useState(false);
	const {
		teamId,
		botId,
		botIcon,
		signature,
		hideSources,
		labels,
		supportLink,
		supportCallback,
		customButtonCallback,
		isAgent, // If new agent api is enabled
		showAgentActivity, // false hides agent status line (default true)
		useFeedback, // If feedback collection is enabled
		useEscalation, // If escalation collection is enabled
		identify,
		showCopyButton,
		localDev,
		allowedDomains,
		linkSafetyEnabled,
		browserLocaleTag
	} = useConfig();
	const { dispatch, state } = useChatbot();
	const headers = {
		Accept: 'application/json',
		'Content-Type': 'application/json'
	};
	if (signature) {
		headers.Authorization = `Bearer ${signature}`;
	}
	const contentRef = useRef(null);
	const streamdownRef = useRef(null);
	const [isSupportLoading, setIsSupportLoading] = useState(false);
	const [isCopied, setIsCopied] = useState(false);
	const [leadFormValues, setLeadFormValues] = useState({});
	const [leadFormTouched, setLeadFormTouched] = useState(false);

	const copyContentToClipboard = async () => {
		// payload.message contains raw markdown
		const markdownContent = payload.message || '';
		// Get rendered HTML from Streamdown component
		const htmlContent = streamdownRef.current?.innerHTML || '';

		try {
			// Try to copy both markdown and HTML formats using ClipboardItem
			if (navigator.clipboard?.write && window.ClipboardItem) {
				const clipboardItemInput = {
					'text/plain': new Blob([markdownContent], {
						type: 'text/plain'
					})
				};

				// Add HTML format if available
				if (htmlContent) {
					clipboardItemInput['text/html'] = new Blob([htmlContent], {
						type: 'text/html'
					});
				}

				await navigator.clipboard.write([
					new ClipboardItem(clipboardItemInput)
				]);

				setIsCopied(true);
				setTimeout(() => setIsCopied(false), 2000);
			} else if (navigator.clipboard?.writeText) {
				// Fallback: copy markdown as plain text
				await navigator.clipboard.writeText(markdownContent);
				setIsCopied(true);
				setTimeout(() => setIsCopied(false), 2000);
			} else {
				// Fallback for older browsers
				const textArea = document.createElement('textarea');
				textArea.value = markdownContent;
				document.body.appendChild(textArea);
				textArea.select();
				document.execCommand('copy');
				document.body.removeChild(textArea);
				setIsCopied(true);
				setTimeout(() => setIsCopied(false), 2000);
			}
		} catch (err) {
			console.warn('DOCSBOT: Unable to copy response', err);
			// Try fallback method - copy markdown as plain text
			try {
				if (navigator.clipboard?.writeText) {
					await navigator.clipboard.writeText(markdownContent);
				} else {
					const textArea = document.createElement('textarea');
					textArea.value = markdownContent;
					document.body.appendChild(textArea);
					textArea.select();
					document.execCommand('copy');
					document.body.removeChild(textArea);
				}
				setIsCopied(true);
				setTimeout(() => setIsCopied(false), 2000);
			} catch (fallbackErr) {
				console.warn('DOCSBOT: Fallback copy also failed', fallbackErr);
			}
		}
	};

	// Check if this is a repeated bot message
	const isRepeatedBotMessage = () => {
		const messageIds = Object.keys(state.messages);
		const currentIndex = messageIds.findIndex(
			(id) => state.messages[id].id === payload.id
		);
		if (currentIndex <= 0) return false; // First message always shows avatar
		const prevMessage = state.messages[messageIds[currentIndex - 1]];
		return prevMessage.variant === 'chatbot';
	};

	// Check if this is the first bot message
	const isFirstBotMessage = () => {
		const messageIds = Object.keys(state.messages);
		const currentIndex = messageIds.findIndex(
			(id) => state.messages[id].id === payload.id
		);
		// Check if this is the first bot message by looking at all previous messages
		for (let i = 0; i < currentIndex; i++) {
			if (state.messages[messageIds[i]].variant === 'chatbot') {
				return false; // Found a bot message before this one
			}
		}
		return currentIndex >= 0 && payload.variant === 'chatbot';
	};

	const runSupportCallback = async (e, history, metadataOverride) => {
		setIsSupportLoading(true);

		// Prevent default to ensure we complete the request before navigation, not really needed as they are not links anymore
		if (e && e.preventDefault) {
			e.preventDefault();
		}

		// post to api endpoint
		const apiBase = localDev
			? `http://127.0.0.1:9000`
			: `https://api.docsbot.ai`;

		let apiUrl;
		if (payload.answerId) {
			apiUrl = `${apiBase}/teams/${teamId}/bots/${botId}/support/${payload.answerId}`;
		} else {
			apiUrl = `${apiBase}/teams/${teamId}/bots/${botId}/conversations/${payload.conversationId}/escalate`;
		}

		// Track link behavior and reserve popup synchronously during the click event for Safari.
		let shouldOpenLink = true;
		const hasSupportLink = Boolean(supportLink && supportLink !== '#');
		const supportWindow =
			e && hasSupportLink ? window.open('', '_blank') : null;

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
			// Make the API call
			await fetch(apiUrl, {
				method: 'PUT',
				headers
			});

			// run callback if provided
			if (supportCallback && typeof supportCallback === 'function') {
				// Create a synthetic event with a cancel hook for support link navigation
				const syntheticEvent = e
					? {
							...e,
							nativeEvent: e.nativeEvent || e
						}
					: {};
				syntheticEvent.preventDefault = () => {
					shouldOpenLink = false;
					if (supportWindow && !supportWindow.closed) {
						supportWindow.close();
					}
				};

				// Build metadata object and include conversation details in agent mode
				const metadata =
					metadataOverride ||
					mergeIdentifyMetadata(identify);
				if (isAgent && payload.conversationId) {
					metadata.conversationId = payload.conversationId;
					metadata.conversationUrl = `https://docsbot.ai/app/bots/${botId}/conversations?conversationId=${payload.conversationId}`;
				}

				// Check the number of parameters the callback expects, don't run slow api call if it's not needed
				const paramCount = supportCallback.length;
				if (paramCount <= 2) {
					await supportCallback(syntheticEvent, history);
				} else if (paramCount === 3) {
					await supportCallback(syntheticEvent, history, metadata);
				} else {
					// only create a ticket if the callback expects 4 parameters
					if (payload.conversationId && isAgent) {
						// make api call to get summary
						const ticketResponse = await fetch(
							`${apiBase}/teams/${teamId}/bots/${botId}/conversations/${payload.conversationId}/ticket`
						);
						const ticket = await ticketResponse.json();
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
			console.warn(`DOCSBOT: Error recording support click: ${err}`);
		} finally {
			setIsSupportLoading(false);
		}
	};

	const runCustomButtonClick = async (reactEvent, history) => {
		let cancelled = false;
		const syntheticEvent = reactEvent
			? {
					...reactEvent,
					nativeEvent: reactEvent.nativeEvent || reactEvent
				}
			: {};
		syntheticEvent.preventDefault = () => {
			cancelled = true;
			if (reactEvent?.preventDefault) {
				reactEvent.preventDefault();
			}
		};
		syntheticEvent.stopPropagation = () => {
			if (reactEvent?.stopPropagation) {
				reactEvent.stopPropagation();
			}
		};
		syntheticEvent.stopImmediatePropagation = () => {
			if (reactEvent?.stopImmediatePropagation) {
				reactEvent.stopImmediatePropagation();
			}
		};

		const metadata = mergeIdentifyMetadata(identify);
		if (isAgent && payload.conversationId) {
			metadata.conversationId = payload.conversationId;
			metadata.conversationUrl = `https://docsbot.ai/app/bots/${botId}/conversations?conversationId=${payload.conversationId}`;
		}
		metadata.answerType = 'custom_button';
		metadata.functionKey = payload.customButton?.functionKey;
		metadata.url = payload.customButton?.url;
		metadata.buttonText = payload.customButton?.buttonText;
		metadata.message = payload.customButton?.message ?? payload.message;

		const button = {
			functionKey: payload.customButton?.functionKey,
			url: payload.customButton?.url,
			buttonText: payload.customButton?.buttonText,
			message: payload.customButton?.message,
			answer: payload.customButton?.answer
		};

		const key = payload.customButton?.functionKey;

		if (customButtonCallback && typeof customButtonCallback === 'function') {
			try {
				await customButtonCallback(
					syntheticEvent,
					key,
					button,
					history,
					metadata
				);
			} catch (err) {
				console.warn('DOCSBOT: customButtonCallback error', err);
			}
		}

		const url = payload.customButton?.url;
		if (
			!cancelled &&
			url &&
			typeof url === 'string' &&
			url.trim()
		) {
			window.open(url.trim(), '_blank', 'noopener,noreferrer');
		}
	};

	// make api call to rate
	const saveRating = async (newRating = 0) => {
		setRating(newRating);
		setRatingSubmitted(true);

		const data = { rating: newRating };

		const apiUrl = localDev
			? `http://127.0.0.1:9000/teams/${teamId}/bots/${botId}/rate/${payload.answerId}`
			: `https://api.docsbot.ai/teams/${teamId}/bots/${botId}/rate/${payload.answerId}`;
		try {
			// If it's an agent and we have a rating response, send it as a new message
			if (isAgent && payload.responses) {
				const ratingMessage =
					newRating === 1
						? payload.responses.yes
						: payload.responses.no;
				if (ratingMessage) {
					dispatch({
						type: 'add_message',
						payload: {
							variant: 'user',
							message: ratingMessage,
							loading: false,
							timestamp: Date.now()
						}
					});
					scrollToBottom(chatContainerRef);
					fetchAnswer(ratingMessage);
				}
			}

			// Scroll to bottom and focus input after rating
			scrollToBottom(chatContainerRef);
			if (inputRef?.current) {
				inputRef.current.focus();
			}

			const response = await fetch(apiUrl, {
				method: 'PUT',
				headers,
				body: JSON.stringify(data)
			});
			if (response.ok) {
				dispatch({
					type: 'update_message',
					payload: {
						id: payload.id,
						rating: newRating
					}
				});
			} else {
				setRating(0);
				try {
					const data = await response.json();
					if (data.error) {
						console.warn(
							data.error ||
								'Something went wrong, please try again.'
						);
					}
				} catch (e) {
					console.warn(e);
				}
			}
		} catch (e) {
			console.warn(e);
			setRating(0);
		}
	};

	useEffect(() => {
		if (!payload?.leadForm?.fields) return;
		const nextValues = {};
		payload.leadForm.fields.forEach((field) => {
			if (!field?.key) return;
			nextValues[field.key] =
				leadFormValues[field.key] ??
				(field.value !== undefined && field.value !== null
					? String(field.value)
					: '');
		});
		setLeadFormValues(nextValues);
	}, [payload?.leadForm?.fields]);

	useEffect(() => {
		if (
			pendingLeadCapture?.trigger &&
			pendingLeadCapture?.type === 'support' &&
			payload.type === 'support_escalation'
		) {
			runSupportCallback(
				null,
				pendingLeadCapture.history || state.chatHistory || [],
				pendingLeadCapture.metadata
			).finally(() => {
				if (typeof onLeadCollectEscalated === 'function') {
					onLeadCollectEscalated();
				}
			});
		}
	}, [pendingLeadCapture, payload.type, payload.isLast]);

	// Scroll to bottom when showing the fallback support link (old support link for non-agent bots)
	useEffect(() => {
		if (
			payload.isLast &&
			supportLink &&
			!isAgent &&
			(payload.sources || payload.error)
		) {
			scrollToBottom(chatContainerRef);
		}
	}, [
		payload.isLast,
		supportLink,
		isAgent,
		payload.sources,
		payload.error,
		chatContainerRef
	]);

	useEffect(() => {
		if (payload?.schedulerEmbed && !payload.loading && payload.message) {
			scrollToBottom(chatContainerRef);
		}
	}, [payload?.schedulerEmbed, payload.loading, payload.message, chatContainerRef]);

	// Check if this message has been replied to by looking for the next message
	const hasNextMessage = () => {
		const messageIds = Object.keys(state.messages);
		const currentIndex = messageIds.findIndex(
			(id) => state.messages[id].id === payload.id
		);
		return currentIndex < messageIds.length - 1;
	};

	// Pre-compute this value once for use in multiple places
	const repeatedBotMessage = isRepeatedBotMessage();
	const hasVisibleSources =
		payload.sources?.length > 0 &&
		(!hideSources ||
			(Array.isArray(hideSources) &&
				!payload.sources.every((source) => hideSources.includes(source.type))));
	const isAgentLookupAnswer =
		isAgent &&
		payload.type !== 'is_resolved_question' &&
		payload.type !== 'support_escalation' &&
		payload.type !== 'custom_button';
	const shouldShowCopyButton =
		showCopyButton &&
		!payload.loading &&
		payload.message &&
		payload.type !== 'lead_collect_message' &&
		payload.type !== 'custom_button' &&
		!isFirstBotMessage() &&
		(isAgentLookupAnswer || (!isAgent && hasVisibleSources));

	const handleCalendlyBookingScheduled = ({
		eventName,
		payload: calendlyPayload,
		url,
		path
	}) => {
		const metadata = buildCalendlyBookingMetadata({
			eventName,
			payload: calendlyPayload,
			url,
			path,
			locale: browserLocaleTag
		});
		persistSchedulerMetadata(metadata);
	};

	const handleCalComBookingSuccessful = ({ eventName, payload: calPayload, url }) => {
		const metadata = buildCalComBookingMetadata({
			eventName,
			payload: calPayload,
			url,
			locale: browserLocaleTag
		});
		persistSchedulerMetadata(metadata);
	};

	const handleTidyCalBookingEvent = ({ eventName, payload, url }) => {
		const metadata = buildTidyCalBookingMetadata({
			eventName,
			payload,
			url,
			locale: browserLocaleTag
		});
		persistSchedulerMetadata(metadata);
	};

	const persistSchedulerMetadata = (metadata) => {
		if (
			!metadata ||
			typeof metadata !== 'object' ||
			typeof onSchedulerBookingMetadata !== 'function'
		) {
			return;
		}
		dispatch({
			type: 'update_message',
			payload: {
				id: payload.id,
				schedulerEmbedCompleted: true,
				bookingSummary: buildBookingSummary(metadata)
			}
		});
		console.log('Scheduler Metadata Saved:', metadata);
		onSchedulerBookingMetadata(metadata);
		if (inputRef?.current) {
			inputRef.current.focus();
		}
	};

	return (
		<>
			<div
				className={clsx(
					'docsbot-chat-bot-message-container',
					botIcon && 'has-avatar',
					repeatedBotMessage && 'consecutive-bot-message'
				)}
			>
				{!repeatedBotMessage && <BotAvatar />}
				<div className="docsbot-chat-bot-message-column">
					{isAgent &&
						showAgentActivity !== false &&
						payload.agentActivity && (
						<div
							className="docsbot-agent-activity"
							aria-live="polite"
						>
							<FontAwesomeIcon
								icon={iconForAgentActivity(
									payload.agentActivity.kind
								)}
								className="docsbot-agent-activity-icon"
								fixedWidth
							/>
							<span
								dir="auto"
								className="docsbot-agent-activity-label"
							>
								{(() => {
									const label = resolveAgentActivityLabel(
										payload.agentActivity,
										labels
									);
									if (!label || typeof label !== 'object') {
										return '';
									}
									if (
										!Array.isArray(label.segments) ||
										label.segments.length === 0
									) {
										return label.text || '';
									}
									return (
										<>
											{label.segments.map(
												(segment, index) =>
													segment.isParam ? (
														<span
															key={`p-${index}`}
															className={clsx(
																'docsbot-agent-activity-param',
																segment.tokenName === 'url' &&
																	'docsbot-agent-activity-param--url'
															)}
															title={
																segment.full ||
																segment.text
															}
														>
															{segment.faviconSrc ? (
																<img
																	src={segment.faviconSrc}
																	className="docsbot-agent-activity-param-favicon"
																	alt=""
																	width={12}
																	height={12}
																	loading="lazy"
																/>
															) : null}
															<span className="docsbot-agent-activity-param-text">
																{segment.text}
															</span>
														</span>
													) : (
														<span key={`t-${index}`}>
															{segment.text}
														</span>
													)
											)}
										</>
									);
								})()}
							</span>
						</div>
					)}
					<div
						className={clsx(
							'docsbot-chat-bot-message bg-slate-100 text-slate-800'
						)}
						{...(payload.error && {
							style: {
								backgroundColor: '#FEFCE8',
								color: '#713F12'
							}
						})}
						ref={messageBoxRef}
					>
					{(() => {
						if (payload.loading) {
							return <Loader />;
						}

						if (payload.type === 'custom_button') {
							return (
								<>
									<div dir="auto" ref={streamdownRef}>
										<Suspense fallback={<Loader />}>
											<LazyStreamdown
												className="docsbot-streamdown"
												allowedDomains={allowedDomains}
												linkSafetyEnabled={
													linkSafetyEnabled
												}
												mode={
													payload.streaming
														? undefined
														: 'static'
												}
												isAnimating={Boolean(
													payload.streaming
												)}
											>
												{preprocessMath(
													payload.message || ''
												)}
											</LazyStreamdown>
										</Suspense>
									</div>
								</>
							);
						}

						if (payload.type === 'lead_collect') {
							const fields =
								Array.isArray(payload.leadForm?.fields) &&
								payload.leadForm.fields.length > 0
									? payload.leadForm.fields
									: [];

							return (
								<div className="space-y-4 w-full">
									<div dir="auto" className="text-sm font-medium text-slate-800">
										{payload.message}
									</div>
									{fields.length > 0 ? (
										<form
											className="space-y-4 w-full"
											onSubmit={(event) => {
												event.preventDefault();
												if (
													event.currentTarget
														.reportValidity &&
													!event.currentTarget.reportValidity()
												) {
													return;
												}
												setLeadFormTouched(true);

												const metadata = {};
												fields.forEach((field, index) => {
													if (!field?.key) return;
													const fieldKey =
														field.key ||
														`field_${index}`;
													const value =
														leadFormValues[
															field.key ||
																fieldKey
														];
													if (
														value !== undefined &&
														value !== null &&
														String(value).trim()
															.length > 0
													) {
														metadata[field.key] =
															String(value).trim();
													}
												});

												if (
													typeof onLeadCollectSubmit ===
													'function'
												) {
													onLeadCollectSubmit({
														metadata
													});
												}
											}}
										>
											<div className="space-y-4">
												{fields.map((field, index) => {
													const fieldKey =
														field.key ||
														`field_${index}`;
													const inputId = `${payload.id}-${fieldKey}`;
													const label =
														field.label ||
														field.name ||
														field.key ||
														`Field ${index + 1}`;
													const inputType =
														field.type || 'text';
													const fieldValue =
														leadFormValues[
															field.key ||
																fieldKey
														] || '';
													const sharedProps = {
														id: inputId,
														name:
															field.key ||
															fieldKey,
														required:
															!!field.required,
														placeholder:
															field.placeholder ||
															undefined,
														autoComplete:
															field.autocomplete ||
															undefined,
														className:
															'w-full rounded-lg border border-border bg-background px-3 py-2 text-base sm:text-sm text-slate-800 shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
														value: fieldValue,
														onChange: (event) => {
															setLeadFormTouched(
																true
															);
															setLeadFormValues(
																(prev) => ({
																	...prev,
																	[field.key ||
																		fieldKey]:
																		event
																			.target
																			.value
																})
															);
														}
													};

													return (
														<label
															key={inputId}
															htmlFor={inputId}
															className="block text-sm text-slate-800"
														>
															<span className="mb-1 block font-semibold">
																{label}
															</span>
															{inputType ===
																'textarea' ? (
																<textarea
																	{...sharedProps}
																	rows={
																		field.rows ||
																		3
																	}
																	className={`${sharedProps.className} min-h-[120px]`}
																/>
															) : inputType ===
																'select' ? (
																<select
																	{...sharedProps}
																>
																	{field.placeholder && (
																		<option
																			value=""
																			disabled={
																				!!field.required
																			}
																		>
																			{
																				field.placeholder
																			}
																		</option>
																	)}
																	{(field.options ||
																		[]).map(
																		(
																			option,
																			optionIndex
																		) => {
																			const optionValue =
																				typeof option ===
																				'string'
																					? option
																					: option.value;
																			const optionLabel =
																				typeof option ===
																				'string'
																					? option
																					: option.label ||
																						option.value;
																			return (
																				<option
																					key={`${inputId}-${optionIndex}`}
																					value={
																						optionValue
																					}
																				>
																					{
																						optionLabel
																					}
																				</option>
																			);
																		}
																	)}
																</select>
															) : (
																<input
																	{...sharedProps}
																	type={
																		inputType
																	}
																/>
															)}
															{field.help && (
																<span className="mt-1 block text-xs text-muted-foreground">
																	{field.help}
																</span>
															)}
														</label>
													);
												})}
											</div>
											<div className="flex flex-wrap items-center gap-2 pt-2">
												<button
													type="submit"
													className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
												>
													{labels.submit ||
														'Submit'}
												</button>
												{typeof onLeadCollectCancel ===
													'function' && (
													<button
														type="button"
														className="rounded-md border border-border bg-background px-4 py-2 text-sm text-slate-800 shadow-sm transition hover:bg-slate-50"
														onClick={() => {
															onLeadCollectCancel();
														}}
													>
														{labels.cancel ||
															'Cancel'}
													</button>
												)}
											</div>
											{leadFormTouched &&
												fields.some(
													(field) =>
														field.required &&
														!String(
															leadFormValues[
																field.key
															] || ''
														).trim()
												) && (
													<div className="text-xs text-red-700">
														{labels.requiredField ||
															'Please fill out required fields.'}
													</div>
												)}
										</form>
										) : null}
									</div>
								);
							}

						return (
							<>
				<div dir="auto" ref={streamdownRef}>
					<Suspense fallback={<Loader />}>
							<LazyStreamdown
								className="docsbot-streamdown"
								allowedDomains={allowedDomains}
								linkSafetyEnabled={linkSafetyEnabled}
								mode={payload.streaming ? undefined : 'static'}
								isAnimating={Boolean(payload.streaming)}
							>
							{preprocessMath(payload.message || '')}
						</LazyStreamdown>
					</Suspense>
				</div>

								{(hasVisibleSources || shouldShowCopyButton) && (
									<div className="docsbot-copy-button-row">
										{hasVisibleSources && (
											<h3 className="docsbot-sources-title">
												{labels.sources}
											</h3>
										)}

										{shouldShowCopyButton && (
											<button
												type="button"
												className={clsx(
													'docsbot-copy-button',
													isCopied && 'copied'
												)}
												onClick={copyContentToClipboard}
												aria-label={
													isCopied
														? labels?.copied ||
														  'Copied!'
														: labels?.copyResponse ||
														  'Copy response'
												}
												title={
													isCopied
														? labels?.copied ||
														  'Copied!'
														: labels?.copyResponse ||
														  'Copy response'
												}
											>
												{isCopied ? <CheckIcon /> : <CopyIcon />}
											</button>
										)}
									</div>
								)}

								{/*
								 * Show sources if:
								 * 1. There are sources available (payload.sources?.length > 0)
								 * 2. AND either:
								 *    a. hideSources is falsy (sources are not hidden globally)
								 *    b. OR hideSources is an array AND not all sources are of types that should be hidden
								 */}
								{hasVisibleSources && (
									<div className="docsbot-sources-container">
										<ul className="docsbot-sources">
											{payload.sources?.map((source, index) => {
												return <Source key={index} source={source} />;
											})}
										</ul>
									</div>
								)}
                                                        </>
                                                );
                                        })()}
					</div>
					{payload.type === 'custom_button' &&
						payload.customButton?.buttonText &&
						!payload.loading && (
							<div className="docsbot-custom-button-cta-row">
								<button
									type="button"
									className="docsbot-custom-button-cta"
									onClick={(e) =>
										runCustomButtonClick(
											e,
											state.chatHistory || []
										)
									}
								>
									<span dir="auto">
										{payload.customButton.buttonText}
									</span>
								</button>
							</div>
						)}
					{payload.schedulerEmbed?.path &&
						!payload.loading &&
						payload.message &&
							<div className="docsbot-full-width-row-block">
								{renderSchedulerEmbed({
									schedulerEmbed: payload.schedulerEmbed,
									messageId: payload.id,
									isCalendlyScriptReady,
									isTidyCalScriptReady,
									onCalendlyBookingScheduled:
										handleCalendlyBookingScheduled,
									onCalComBookingSuccessful:
										handleCalComBookingSuccessful,
									onTidyCalBookingEvent:
										handleTidyCalBookingEvent
								})}
							</div>}
					{!payload.schedulerEmbed?.path &&
						payload.bookingSummary &&
						!payload.loading &&
						payload.message && (
							<div className="docsbot-full-width-row-block">
									{renderBookingSummaryCard(
										payload.bookingSummary,
										labels
									)}
								</div>
							)}
					{payload.stripeBilling && (
						<div className="docsbot-full-width-row-block">
							<StripeBilling data={payload.stripeBilling} />
						</div>
					)}
				</div>
                        </div>

			{/*
				This section handles feedback for agent-based responses.
				It shows a custom thumbs up/down button for the user to rate the answer.
				The saveRating function makes an API call to store the user's feedback.
			*/}
			{useFeedback &&
				isAgent &&
				payload.type == 'is_resolved_question' &&
				!ratingSubmitted &&
				!hasNextMessage() && (
					<>
						<div
							className={clsx(
								'docbot-chat-bot-message-rate',
								botIcon && 'has-avatar'
							)}
						>
							<button
								onClick={(e) => {
									saveRating(1);
								}}
								title={labels.helpful}
								className={clsx(
									'doscbot-rate-good',
									rating === 1 && 'selected'
								)}
								{...(rating === 1 && { disabled: true })}
							>
								<span dir="auto" aria-hidden="true">
									{payload.responses?.yes ||
										labels.feedbackYes ||
										'👍'}
								</span>
							</button>

							<button
								onClick={(e) => {
									saveRating(-1);
								}}
								title={labels.unhelpful}
								className={clsx(
									'doscbot-rate-bad',
									rating === -1 && 'selected'
								)}
								{...(rating === -1 && { disabled: true })}
							>
								<span dir="auto" aria-hidden="true">
									{payload.responses?.no ||
										labels.feedbackNo ||
										'👎'}
								</span>
							</button>
						</div>
					</>
				)}

			{/*
				This section handles feedback for old non-agent-based responses.

				Each feedback section includes:
				1. An optional message explaining the feedback purpose
				2. Thumbs up/down buttons for user rating
				3. Visual indication of selected rating

				The saveRating function makes an API call to store the user's feedback.
			*/}
			{useFeedback &&
				!isAgent &&
				payload.isLast &&
				!payload.loading &&
				payload.sources &&
				(payload.sources.length > 0 || payload.couldAnswer === false) &&
				rating === 0 && (
					<>
						<div
							className={clsx(
								'docsbot-chat-bot-message-container',
								botIcon && 'has-avatar'
							)}
						>
							<div className="docsbot-chat-bot-message bg-slate-100 text-slate-800">
								<span dir="auto">{labels.feedbackMessage}</span>
							</div>
						</div>

						<div
							className={clsx(
								'docbot-chat-bot-message-rate',
								botIcon && 'has-avatar'
							)}
						>
							<button
								onClick={(e) => {
									saveRating(1);
								}}
								title={labels.helpful}
								className={clsx(
									'doscbot-rate-good',
									rating === 1 && 'selected'
								)}
								{...(rating === 1 && { disabled: true })}
							>
								<span dir="auto" aria-hidden="true">
									{labels.feedbackYes || '👍'}
								</span>
							</button>

							<button
								onClick={(e) => {
									saveRating(-1);
								}}
								title={labels.unhelpful}
								className={clsx(
									'doscbot-rate-bad',
									rating === -1 && 'selected'
								)}
								{...(rating === -1 && { disabled: true })}
							>
								<span dir="auto" aria-hidden="true">
									{labels.feedbackNo || '👎'}
								</span>
							</button>
						</div>
					</>
				)}

			{/*
        This section handles feedback for agent-based responses.
        It shows a custom thumbs up/down button for the user to rate the answer.
        The saveRating function makes an API call to store the user's feedback.
      */}
			{useEscalation &&
				isAgent &&
				payload.isLast &&
				payload.type == 'support_escalation' &&
				(supportLink ||
					(supportCallback &&
						typeof supportCallback === 'function')) && (
					<>
						<div
							className={clsx(
								'docbot-chat-bot-message-rate',
								botIcon && 'has-avatar'
							)}
						>
							<button
								disabled={isSupportLoading}
								onClick={(e) =>
									{
										if (
											leadCollectMode ===
											'before_escalation'
										) {
											const didOpen =
												typeof onLeadCollectRequest ===
												'function' &&
												onLeadCollectRequest({
													history:
														state.chatHistory || []
												});
											if (didOpen) return;
										}
										runSupportCallback(
											e,
											state.chatHistory || []
										);
									}
								}
							>
								{isSupportLoading ? (
									<Loader />
								) : (
									<span dir="auto" aria-hidden="true">
										{payload.responses?.yes ||
											labels.getSupport}
									</span>
								)}
							</button>

							{!isSupportLoading && (
								<button
									onClick={(e) => {
										const message =
											payload.responses?.no ||
											labels.feedbackNo ||
											'👎';
										dispatch({
											type: 'add_message',
											payload: {
												variant: 'user',
												message: message,
												loading: false,
												timestamp: Date.now()
											}
										});
										fetchAnswer(message);
										// Scroll to bottom and focus input after clicking no
										scrollToBottom(chatContainerRef);
										if (inputRef?.current) {
											inputRef.current.focus();
										}
									}}
									className=""
								>
									<span dir="auto" aria-hidden="true">
										{payload.responses?.no ||
											labels.feedbackNo ||
											'👎'}
									</span>
								</button>
							)}
						</div>
					</>
				)}

			{/*
				Show old support link if it's not an agent and there are sources or an error
				This is the old support link that was used in the previous version of the chatbot

			*/}
			{(payload.isLast &&
				(supportLink ||
					(supportCallback &&
						typeof supportCallback === 'function')) &&
				!isAgent &&
				useEscalation &&
				(!useFeedback ||
					rating === -1 ||
					(payload.sources && payload.sources.length == 0)) &&
				(payload.sources || payload.couldAnswer === false)) ||
			(payload.error &&
				!payload.isRateLimitError &&
				(supportLink ||
					(supportCallback &&
						typeof supportCallback === 'function'))) ? (
				<div
					className={clsx(
						'docbot-chat-bot-message-rate',
						botIcon && 'has-avatar'
					)}
				>
					<button
						onClick={(e) =>
							runSupportCallback(e, state.chatHistory || [])
						}
						disabled={isSupportLoading}
						className="docsbot-support-button"
					>
						{isSupportLoading ? (
							<Loader />
						) : (
							<span dir="auto">{labels.getSupport}</span>
						)}
					</button>
				</div>
			) : null}
		</>
	);
};

function buildCalendlyBookingMetadata({
	eventName,
	payload,
	url,
	path,
	locale
}) {
	const metadata = {
		booking_state: 'booked'
	};

	const startTime = extractCalendlyField(payload, [
		['event', 'start_time'],
		['invitee', 'start_time'],
		['event', 'start_time_pretty'],
		['invitee', 'scheduled_at'],
		['event', 'startTime'],
		['invitee', 'startTime'],
		['scheduled_at']
	]);
	if (startTime) {
		metadata.booking_start_time = startTime;
		metadata.booking_start_time_local = formatCalendlyDate(
			startTime,
			locale
		);
	}

	const endTime = extractCalendlyField(payload, [
		['event', 'end_time'],
		['invitee', 'end_time'],
		['event', 'endTime'],
		['invitee', 'endTime']
	]);
	if (endTime) {
		metadata.booking_end_time = endTime;
		metadata.booking_end_time_local = formatCalendlyDate(
			endTime,
			locale
		);
	}

	const eventNameValue =
		extractCalendlyField(payload, [
		['event_type', 'name'],
		['event_type', 'kind'],
		['event_type', 'slug'],
		['event_type', 'event_type_name'],
		['event', 'event_type_name'],
		['event', 'name'],
		['event', 'event_type'],
		['invitee', 'event_type_name'],
		['invitee', 'name'],
		['event_name']
	]) || inferSchedulerTitleFromPath(path || url);
	if (eventNameValue) {
		metadata.booking_title = eventNameValue;
	}

	return compactSchedulerMetadata(metadata);
}

function buildCalComBookingMetadata({ eventName, payload, url, locale }) {
	const metadata = {
		booking_state:
			eventName === 'rescheduleBookingSuccessfulV2'
				? 'rescheduled'
				: 'booked'
	};

	if (typeof payload?.title === 'string' && payload.title.trim()) {
		metadata.booking_title = payload.title.trim();
	}

	if (payload?.startTime) {
		metadata.booking_start_time = payload.startTime;
		metadata.booking_start_time_local = formatCalendlyDate(
			payload.startTime,
			locale
		);
	}

	if (payload?.endTime) {
		metadata.booking_end_time = payload.endTime;
		metadata.booking_end_time_local = formatCalendlyDate(
			payload.endTime,
			locale
		);
	}

	return compactSchedulerMetadata(metadata);
}

function buildTidyCalBookingMetadata({ eventName, payload, url, locale }) {
	const metadata = {
		booking_state: inferTidyCalState(eventName)
	};

	const title = extractNestedString(payload, [
		['title'],
		['eventTypeName'],
		['bookingTypeName'],
		['event_name'],
		['data', 'title'],
		['data', 'booking_type', 'title'],
		['data', 'booking_type', 'name'],
		['data', 'booking', 'title'],
		['data', 'booking', 'booking_type_title'],
		['data', 'booking', 'booking_type_name'],
		['data', 'bookings', 0, 'title'],
		['data', 'bookings', 0, 'booking_type_title'],
		['data', 'bookings', 0, 'booking_type_name']
	]);
	if (title) {
		metadata.booking_title = title;
	} else {
		const inferredTitle = inferSchedulerTitleFromPath(url);
		if (inferredTitle) {
			metadata.booking_title = inferredTitle;
		}
	}

	const startTime = extractNestedString(payload, [
		['startTime'],
		['start_time'],
		['dateTime'],
		['scheduledAt'],
		['data', 'startTime'],
		['data', 'start_time'],
		['data', 'starts_at'],
		['data', 'booking', 'startTime'],
		['data', 'booking', 'start_time'],
		['data', 'booking', 'starts_at'],
		['data', 'bookings', 0, 'startTime'],
		['data', 'bookings', 0, 'start_time'],
		['data', 'bookings', 0, 'starts_at']
	]);
	if (startTime) {
		metadata.booking_start_time = startTime;
		metadata.booking_start_time_local = formatCalendlyDate(
			startTime,
			locale
		);
	}

	const endTime = extractNestedString(payload, [
		['endTime'],
		['end_time'],
		['data', 'endTime'],
		['data', 'end_time'],
		['data', 'ends_at'],
		['data', 'booking', 'endTime'],
		['data', 'booking', 'end_time'],
		['data', 'booking', 'ends_at'],
		['data', 'bookings', 0, 'endTime'],
		['data', 'bookings', 0, 'end_time'],
		['data', 'bookings', 0, 'ends_at']
	]);
	if (endTime) {
		metadata.booking_end_time = endTime;
		metadata.booking_end_time_local = formatCalendlyDate(
			endTime,
			locale
		);
	}

	return compactSchedulerMetadata(metadata);
}

function compactSchedulerMetadata(metadata) {
	return Object.entries(metadata || {}).reduce((acc, [key, value]) => {
		if (
			value !== undefined &&
			value !== null &&
			!(typeof value === 'string' && value.trim() === '')
		) {
			acc[key] = value;
		}
		return acc;
	}, {});
}

function buildBookingSummary(metadata) {
	if (!metadata || typeof metadata !== 'object') {
		return null;
	}

	const state = firstString(metadata.booking_state);
	if (!state) {
		return null;
	}

	return compactSchedulerMetadata({
		state,
		title: firstString(metadata.booking_title),
		startTime: firstString(
			metadata.booking_start_time_local,
			metadata.booking_start_time
		),
		endTime: firstString(
			metadata.booking_end_time_local,
			metadata.booking_end_time
		)
	});
}

function firstString(...values) {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
	return null;
}

function extractNestedString(payload, pathOptions) {
	for (const path of pathOptions) {
		let current = payload;
		for (const segment of path) {
			if (current === null || current === undefined) {
				current = null;
				break;
			}
			current = current[segment];
		}
		if (typeof current === 'string' && current.trim()) {
			return current.trim();
		}
		if (typeof current === 'number' && Number.isFinite(current)) {
			return String(current);
		}
	}
	return null;
}

function inferTidyCalState(eventName) {
	return eventName === 'bookingComplete' ? 'booked' : 'selected';
}

function extractCalendlyField(payload, pathOptions) {
	for (const path of pathOptions) {
		let current = payload;
		for (const segment of path) {
			if (!current || typeof current !== 'object') {
				current = null;
				break;
			}
			current = current[segment];
		}
		if (typeof current === 'string' && current.trim()) {
			return current.trim();
		}
	}
	return null;
}

function inferSchedulerTitleFromPath(pathOrUrl) {
	if (!pathOrUrl || typeof pathOrUrl !== 'string') {
		return null;
	}
	const value = pathOrUrl.trim();
	if (!value) {
		return null;
	}

	let lastSegment = value;
	try {
		const parsed = new URL(value);
		const segments = parsed.pathname.split('/').filter(Boolean);
		lastSegment = segments[segments.length - 1] || value;
	} catch {
		const segments = value.split('/').filter(Boolean);
		lastSegment = segments[segments.length - 1] || value;
	}

	const normalized = lastSegment
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!normalized) {
		return null;
	}

	const lower = normalized.toLowerCase();
	const exactMap = {
		'15m': '15 Minute Meeting',
		'15min': '15 Minute Meeting',
		'15mins': '15 Minute Meeting',
		'30m': '30 Minute Meeting',
		'30min': '30 Minute Meeting',
		'30mins': '30 Minute Meeting',
		'45m': '45 Minute Meeting',
		'45min': '45 Minute Meeting',
		'45mins': '45 Minute Meeting',
		'60m': '60 Minute Meeting',
		'60min': '60 Minute Meeting',
		'60mins': '60 Minute Meeting',
		'90m': '90 Minute Meeting',
		'90min': '90 Minute Meeting',
		'90mins': '90 Minute Meeting'
	};
	if (exactMap[lower]) {
		return exactMap[lower];
	}

	const humanized = normalized
		.split(' ')
		.map((part) => humanizeSchedulerSlugPart(part))
		.filter(Boolean)
		.join(' ')
		.trim();

	return humanized || null;
}

function humanizeSchedulerSlugPart(part) {
	if (!part) return '';
	const value = String(part).trim();
	if (!value) return '';
	const lower = value.toLowerCase();

	if (/^\d+(m|min|mins)$/.test(lower)) {
		const minutes = lower.match(/^\d+/)?.[0];
		return minutes ? `${minutes} Minute` : '';
	}

	const tokenMap = {
		mtg: 'Meeting',
		mtgs: 'Meetings',
		intro: 'Intro',
		demo: 'Demo',
		consult: 'Consult',
		consultation: 'Consultation',
		call: 'Call',
		meeting: 'Meeting',
		session: 'Session',
		min: 'Minute',
		mins: 'Minutes',
		hr: 'Hour',
		hrs: 'Hours'
	};
	if (tokenMap[lower]) {
		return tokenMap[lower];
	}

	if (/^\d+$/.test(lower)) {
		return lower;
	}

	return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function renderBookingSummaryCard(summary, labels) {
	const state = String(summary?.state || '').toLowerCase();
	const isRescheduled = state === 'rescheduled';
	const badgeClasses = isRescheduled
		? 'bg-amber-100 text-amber-800 border-amber-200'
		: 'bg-emerald-100 text-emerald-800 border-emerald-200';
	const heading = isRescheduled
		? labels?.bookingStatusRescheduled || 'Rescheduled'
		: labels?.bookingStatusBooked || 'Booked';

	return (
		<div className="w-full border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm min-w-0">
			<div className="p-3 sm:p-4">
				<div className="flex justify-between items-start mb-2 gap-2">
					<div className="flex items-center gap-2 min-w-0">
						<FontAwesomeIcon
							icon={faCalendarDays}
							className="text-slate-400 w-4 h-4 shrink-0"
						/>
						<span className="font-semibold text-slate-800 text-sm sm:text-base truncate">
							{heading}
						</span>
					</div>
					<span
						className={clsx(
							'shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border',
							badgeClasses
						)}
					>
						{heading}
					</span>
				</div>

					<div className="text-sm text-slate-600 space-y-2">
						{summary?.title && (
							<div className="min-w-0">
								<span className="block text-xs text-slate-400 truncate">
									{labels?.bookingSummaryEvent || 'Event'}
								</span>
								<span className="font-medium text-slate-800 truncate block">
									{summary.title}
								</span>
							</div>
						)}
						{(summary?.startTime || summary?.endTime) && (
							<div className="grid grid-cols-2 gap-2">
								{summary?.startTime && (
									<div className="min-w-0">
										<span className="block text-xs text-slate-400 truncate">
											{labels?.bookingSummaryStarts || 'Starts'}
										</span>
										<span className="font-medium text-slate-800 truncate block">
											{summary.startTime}
										</span>
									</div>
								)}
								{summary?.endTime && (
									<div className="min-w-0">
										<span className="block text-xs text-slate-400 truncate">
											{labels?.bookingSummaryEnds || 'Ends'}
										</span>
										<span className="truncate block">{summary.endTime}</span>
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		);
	}

function formatCalendlyDate(value, locale) {
	if (!value) {
		return '';
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}

	try {
		return new Intl.DateTimeFormat(locale || undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(date);
	} catch {
		return date.toLocaleString();
	}
}

function renderSchedulerEmbed({
	schedulerEmbed,
	messageId,
	isCalendlyScriptReady,
	isTidyCalScriptReady,
	onCalendlyBookingScheduled,
	onCalComBookingSuccessful,
	onTidyCalBookingEvent
}) {
	if (schedulerEmbed?.provider === 'calendly') {
		return (
			<div className="w-full">
				<CalendlyEmbed
					path={schedulerEmbed.path}
					hideEventDetails={schedulerEmbed.hideEventDetails}
					hideCookieBanner={schedulerEmbed.hideCookieBanner}
					scriptReady={isCalendlyScriptReady}
					onBookingScheduled={onCalendlyBookingScheduled}
				/>
			</div>
		);
	}

	if (schedulerEmbed?.provider === 'calcom') {
		return (
			<div className="w-full">
				<CalComEmbed
					path={schedulerEmbed.path}
					hideEventDetails={schedulerEmbed.hideEventDetails}
					messageId={messageId}
					onBookingSuccessful={onCalComBookingSuccessful}
				/>
			</div>
		);
	}

	if (schedulerEmbed?.provider === 'tidycal') {
		return (
			<div className="w-full">
				<TidyCalEmbed
					path={schedulerEmbed.path}
					hideEventDetail={schedulerEmbed.hideEventDetail}
					scriptReady={isTidyCalScriptReady}
					onBookingEvent={onTidyCalBookingEvent}
				/>
			</div>
		);
	}

	return null;
}
