import { useState, useEffect, useRef } from 'react';
import { Loader } from '../loader/Loader';
import { useConfig } from '../configContext/ConfigContext';
import { BotAvatar } from '../botAvatar/BotAvatar';
import { Source } from '../source/Source';
import { useChatbot } from '../chatbotContext/ChatbotContext';
import { scrollToBottom, getHighlightJs } from '../../utils/utils';
import clsx from 'clsx';

export const BotChatMessage = ({
	payload,
	messageBoxRef,
	fetchAnswer,
	chatContainerRef,
	inputRef
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
		localDev
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
	const [hljs, setHljs] = useState(null);
	const [isSupportLoading, setIsSupportLoading] = useState(false);

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

	useEffect(() => {
		getHighlightJs().then(setHljs);
	}, []);

	useEffect(() => {
		if (contentRef.current && hljs) {
			const codeBlocks = contentRef.current.querySelectorAll('pre code');
			codeBlocks.forEach((block) => {
				hljs.highlightElement(block);
			});
		}
	}, [payload.message, hljs]);

	const runSupportCallback = async (e, history) => {
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

		// Create a flag to track if we should open the link
		let shouldOpenLink = true;

		try {
			// Make the API call
			await fetch(apiUrl, {
				method: 'PUT',
				headers
			});

			// run callback if provided
			if (supportCallback && typeof supportCallback === 'function') {
				// Create a synthetic event with its own preventDefault method
				const syntheticEvent = e ? { ...e } : {};
				syntheticEvent.preventDefault = () => {
					shouldOpenLink = false;
				};

				// Check the number of parameters the callback expects, don't run slow api call if it's not needed
				const paramCount = supportCallback.length;
				if (paramCount <= 2) {
					await supportCallback(syntheticEvent, history);
				} else if (paramCount === 3) {
					await supportCallback(
						syntheticEvent,
						history,
						identify.metadata || {}
					);
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
							identify.metadata || {},
							ticket
						);
					} else {
						await supportCallback(
							syntheticEvent,
							history,
							identify.metadata || {},
							null
						);
					}
				}
			}
			// Open the link if it exists and shouldOpenLink is still true
			if (shouldOpenLink && supportLink && supportLink !== '#') {
				window.open(supportLink, '_blank');
			}
		} catch (err) {
			// Open the link if it exists and shouldOpenLink is still true
			if (shouldOpenLink && supportLink && supportLink !== '#') {
				window.open(supportLink, '_blank');
			}
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

	return (
		<>
			<div className={clsx(
				"docsbot-chat-bot-message-container", 
				botIcon && 'has-avatar',
				repeatedBotMessage && 'consecutive-bot-message'
			)}>
				{!repeatedBotMessage && <BotAvatar />}
				<div
					className="docsbot-chat-bot-message"
					{...(payload.error && {
						style: { backgroundColor: '#FEFCE8', color: '#713F12' }
					})}
					ref={messageBoxRef}
				>
					{(() => {
						if (payload.loading) {
							return <Loader />;
						}

						return (
							<>
								<span
									ref={contentRef}
									dir="auto"
									dangerouslySetInnerHTML={{
										__html: payload.message
									}}
								/>

								{/* 
								 * Show sources if:
								 * 1. There are sources available (payload.sources?.length > 0)
								 * 2. AND either:
								 *    a. hideSources is falsy (sources are not hidden globally)
								 *    b. OR hideSources is an array AND not all sources are of types that should be hidden
								 */}
								{payload.sources?.length > 0 && 
									(!hideSources || 
									(Array.isArray(hideSources) && 
									!payload.sources.every(source => hideSources.includes(source.type)))) && (
										<div className="docsbot-sources-container">
											<h3 className="docsbot-sources-title">
												{labels.sources}
											</h3>

											<ul className="docsbot-sources">
												{payload.sources?.map(
													(source, index) => {
														return (
															<Source
																key={index}
																source={source}
															/>
														);
													}
												)}
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
							<div className="docsbot-chat-bot-message">
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
									runSupportCallback(
										e,
										state.chatHistory || []
									)
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
				(!useFeedback || rating === -1 || (payload.sources && payload.sources.length == 0)) &&
				(payload.sources || payload.couldAnswer === false)) ||
			(payload.error &&
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
						{isSupportLoading ? <Loader /> : <span dir="auto">{labels.getSupport}</span>}
					</button>
				</div>
			) : null}
		</>
	);
};
