import { useState, useEffect, useRef } from 'react';
import { Loader } from '../loader/Loader';
import { useConfig } from '../configContext/ConfigContext';
import { BotAvatar } from '../botAvatar/BotAvatar';
import { Source } from '../source/Source';
import { useChatbot } from '../chatbotContext/ChatbotContext';
import { getHighlightJs } from '../../utils/highlightjs';
import clsx from 'clsx';

export const BotChatMessage = ({ payload, messageBoxRef, fetchAnswer }) => {
	const [rating, setRating] = useState(payload.rating || 0);
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

	const runSupportCallback = (e, history) => {
		setIsSupportLoading(true);

		// Store the original URL we want to navigate to
		const targetUrl = e && e.target && e.target.href;

		// Prevent default to ensure we complete the request before navigation
		if (e && e.preventDefault) {
			e.preventDefault();
		}

		// post to api endpoint
    const apiBase = localDev ? `http://127.0.0.1:9000` : `https://api.docsbot.ai`;
		const apiUrl = isAgent
			? `${apiBase}/teams/${teamId}/bots/${botId}/conversations/${payload.conversationId}/escalate`
			: `${apiBase}/teams/${teamId}/bots/${botId}/support/${payload.answerId}`;

		// Return a promise to ensure the request completes
		return fetch(apiUrl, {
			method: 'PUT',
			body: JSON.stringify({
				answer_id: payload.answerId || null // only used for agent
			}),
			headers
		})
			.catch((err) => {
				console.warn(`DOCSBOT: Error recording support click: ${err}`);
			})
			.finally(() => {
				// Create a flag to track if we should open the link
				let shouldOpenLink = true;

				setIsSupportLoading(false);

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
						supportCallback(syntheticEvent, history);
					} else {
            if (payload.conversationId) {
              // make api call to get summary
              fetch(`${apiBase}/teams/${teamId}/bots/${botId}/conversations/${payload.conversationId}/ticket`)
                .then(response => response.json())
                .then(ticket => {
                  supportCallback(
                    syntheticEvent,
                    history,
                    identify.metadata || {},
                    ticket,
                  );
                })
                .catch(error => {
                  console.error('DOCSBOT: Error generating AI summary ticket:', error);
                  supportCallback(
                    syntheticEvent,
                    history,
                    identify.metadata || {},
                    null,
                  );
                });
              } else {
                supportCallback(
                  syntheticEvent,
                  history,
                  identify.metadata || {},
                  null,
                );
              }
					}
				}

				// Open the link if it exists and shouldOpenLink is still true
				if (shouldOpenLink && targetUrl && targetUrl !== '#') {
					window.open(targetUrl, '_blank');
				}
			});
	};

	// make api call to rate
	const saveRating = async (newRating = 0) => {
		setRating(newRating);

		const data = { rating: newRating };

		const apiUrl = localDev ? `http://127.0.0.1:9000/teams/${teamId}/bots/${botId}/rate/${payload.answerId}` : `https://api.docsbot.ai/teams/${teamId}/bots/${botId}/rate/${payload.answerId}`;
		try {
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

	return (
		<>
			<div className="docsbot-chat-bot-message-container">
				<BotAvatar />
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
									dangerouslySetInnerHTML={{
										__html: payload.message
									}}
								/>

								{!hideSources &&
									payload.sources?.length > 0 && (
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
                                source={
                                  source
                                }
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
			{useFeedback && isAgent && payload.type == "is_resolved_question" && (
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
							<span aria-hidden="true">{payload.responses?.yes || labels.feedbackYes || '👍'}</span>
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
							<span aria-hidden="true">{payload.responses?.no || labels.feedbackNo || '👎'}</span>
						</button>
					</div>
				</>
			)}

      {/*
        This section handles feedback for agent-based responses.

        Each feedback section includes:
        1. An optional message explaining the feedback purpose
        2. Thumbs up/down buttons for user rating
        3. Visual indication of selected rating

        The saveRating function makes an API call to store the user's feedback.
      */}
      {useFeedback && !isAgent && payload.isLast && !payload.loading && payload.sources && (
				<>
          <div
            className={clsx(
              'docsbot-chat-bot-message-container',
              botIcon && 'has-avatar'
            )}
          >
            <div className="docsbot-chat-bot-message">
              {labels.feedbackMessage}
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
							<span aria-hidden="true">{labels.feedbackYes || '👍'}</span>
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
							<span aria-hidden="true">{labels.feedbackNo || '👎'}</span>
						</button>
					</div>
				</>
			)}

      {/*
        This section handles feedback for agent-based responses.
        It shows a custom thumbs up/down button for the user to rate the answer.
        The saveRating function makes an API call to store the user's feedback.
      */}
      {useEscalation && isAgent && payload.isLast && payload.type == "support_escalation" && ( supportLink || (supportCallback && typeof supportCallback === 'function') ) && (
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
							{isSupportLoading
								? <Loader />
								: <span aria-hidden="true">{payload.responses?.yes || labels.getSupport}</span>
							}
						</button>

						<button
							onClick={(e) => {
                const message = payload.responses?.no || labels.feedbackNo || '👎';
                dispatch({
                  type: "add_message",
                  payload: {
                    variant: "user",
                    message: message,
                    loading: false,
                    timestamp: Date.now(),
                  },
                });
								fetchAnswer(message);
							}}
							className=""
						>
							<span aria-hidden="true">{payload.responses?.no || labels.feedbackNo || '👎'}</span>
						</button>
					</div>
				</>
			)}

      {/*
        Show old support link if it's not an agent and there are sources or an error
        This is the old support link that was used in the previous version of the chatbot
      */}
			{payload.isLast &&
				supportLink &&
				!isAgent &&
				(payload.sources || payload.error) && (
					<div
						className={clsx(
							'docsbot-chat-bot-message-container',
							botIcon && 'has-avatar'
						)}
					>
						<div className="docsbot-chat-bot-message-support">
							<a
								href={supportLink}
								target="_blank"
								onClick={(e) =>
									runSupportCallback(
										e,
										state.chatHistory || []
									)
								}
							>
								{labels.getSupport}
							</a>
						</div>
					</div>
				)}
		</>
	);
};
