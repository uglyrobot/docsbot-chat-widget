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
	leadCollectMode,
	pendingLeadCapture
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
		isAgent, // If new agent api is enabled
		useFeedback, // If feedback collection is enabled
		useEscalation, // If escalation collection is enabled
		identify,
		showCopyButton,
		localDev,
		allowedDomains,
		linkSafetyEnabled
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
		isAgent && payload.type !== 'is_resolved_question' && payload.type !== 'support_escalation';
	const shouldShowCopyButton =
		showCopyButton &&
		!payload.loading &&
		payload.message &&
		payload.type !== 'lead_collect_message' &&
		!isFirstBotMessage() &&
		(isAgentLookupAnswer || (!isAgent && hasVisibleSources));

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
				<div
					className={clsx(
						'docsbot-chat-bot-message bg-slate-100 text-slate-800'
					)}
					{...(payload.error && {
						style: { backgroundColor: '#FEFCE8', color: '#713F12' }
					})}
					ref={messageBoxRef}
				>
					{(() => {
						if (payload.loading) {
							return <Loader />;
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
