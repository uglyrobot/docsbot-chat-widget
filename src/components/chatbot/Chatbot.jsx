/** @format */

import { useEffect, useRef, useState, createRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { remark } from 'remark';
import html from 'remark-html';
import remarkGfm from 'remark-gfm';
import externalLinks from 'remark-external-links';
import { useChatbot } from '../chatbotContext/ChatbotContext';
import { useConfig } from '../configContext/ConfigContext';
import { BotChatMessage } from '../botChatMessage/BotChatMessage';
import { UserChatMessage } from '../userChatMessage/UserChatMessage';
import { Options } from '../options/Options';
import clsx from 'clsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
	faXmark,
	faRefresh,
	faPaperPlane,
	faChevronDown,
	faTimes
} from '@fortawesome/free-solid-svg-icons';
import { faImage } from '@fortawesome/free-regular-svg-icons';
import { Emitter, decideTextColor, scrollToBottom } from '../../utils/utils';
import DocsBotLogo from '../../assets/images/docsbot-logo.svg';
import { fetchEventSource } from '@microsoft/fetch-event-source';

// Define error classes for fetchEventSource
class RetriableError extends Error {}
class FatalError extends Error {}

export const Chatbot = ({ isOpen, setIsOpen, isEmbeddedBox }) => {
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
		useFeedback, // If feedback collection is enabled
		useEscalation, // If escalation collection is enabled
		useImageUpload, // If image upload is enabled
		keepFooterVisible,
		localDev
	} = useConfig();
	const ref = useRef();
	const inputRef = useRef();
	const fileInputRef = useRef(null);
	const mediaMatch = window.matchMedia('(min-width: 480px)');
	const messagesRefs = useRef({});
	const [isFetching, setIsFetching] = useState(false);
	const [isAtBottom, setIsAtBottom] = useState(true);
	const [streamController, setStreamController] = useState(null);

	const allowedSingleCharLanguages = ['ja', 'zh', 'ko'];
	const allowSingleCharMessage = allowedSingleCharLanguages.some((lang) =>
		navigator.language?.startsWith(lang)
	);
	const minInputLength = allowSingleCharMessage ? 1 : 2;

	const handleImageSelect = (e) => {
		if (!useImageUpload) return;
		const files = Array.from(e.target.files);
		processImageFiles(files);
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
		fileInputRef.current.click();
	};

	useEffect(() => {
		Emitter.on('docsbot_add_user_message', async ({ message, send }) => {
			await dispatch({
				type: 'add_message',
				payload: {
					variant: 'user',
					message: message,
					loading: false,
					timestamp: Date.now()
				}
			});

			scrollToBottom(ref);

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
					message: await parseMarkdown(message),
					loading: false,
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

	// Close on Escape when acting as a dialog (floating mode)
	useEffect(() => {
		if (isEmbeddedBox) return;
		const onKeyDown = (e) => {
			if (e.key === 'Escape') {
				setIsOpen(false);
			}
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [isEmbeddedBox, setIsOpen]);

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
		localStorage.removeItem(`DocsBot_${botId}_conversationId`);

		// Add first message after clearing
		if (labels.firstMessage) {
			const parsedMessage = await parseMarkdown(labels.firstMessage);
			dispatch({
				type: 'add_message',
				payload: {
					id: uuidv4(),
					variant: 'chatbot',
					message: parsedMessage,
					timestamp: Date.now()
				}
			});
		}
	};

	useEffect(() => {
		const addFirstMessage = async () => {
			const parsedMessage = await parseMarkdown(labels.firstMessage);

			dispatch({
				type: 'add_message',
				payload: {
					id: uuidv4(),
					variant: 'chatbot',
					message: parsedMessage,
					timestamp: Date.now()
				}
			});
		};

		const fetchData = async () => {
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
							payload: { savedConversation: savedConversation }
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
		};

		fetchData();
	}, [labels.firstMessage]);

	useEffect(() => {
		localStorage.setItem(
			`DocsBot_${botId}_chatHistory`,
			JSON.stringify(state.messages)
		);
	}, [state.messages]);

	useEffect(() => {
		if (state.chatHistory) {
			localStorage.setItem(
				`DocsBot_${botId}_localChatHistory`,
				JSON.stringify(state?.chatHistory)
			);
		}
	}, [state.chatHistory]);

	async function fetchAnswer(question, image_urls = []) {
		const id = uuidv4();
		setIsFetching(true);
		let answerId = null;

		const abortController = new AbortController();
		setStreamController(abortController);

		dispatch({
			type: 'add_message',
			payload: {
				id,
				variant: 'chatbot',
				message: null,
				loading: true,
				timestamp: Date.now()
			}
		});

		// Change this to use native JS event
		document.dispatchEvent(
			new CustomEvent('docsbot_fetching_answer', { detail: { question } })
		);

		// Scroll to the bottom of the chat container
		// This ensures the latest message is visible to the user
		scrollToBottom(ref);

		let currentHeight = 0;
		let answer = '';
		let metadata = identify;
		metadata.referrer = window.location.href;

		if (isAgent) {
			const sse_req = {
				stream: true,
				question,
				format: 'markdown',
				human_escalation: useEscalation ? true : false,
				followup_rating: useFeedback ? true : false,
				document_retriever: true,
				full_source: false,
				metadata,
				conversationId: getConversationId(),
				context_items: contextItems || 6,
				autocut: 2,
				default_language: navigator.language,
				image_urls:
					image_urls.length > 0 && useImageUpload
						? image_urls
						: undefined
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
						const currentReplyHeight =
							messagesRefs?.current[id]?.current?.clientHeight;
						const data = event;
						//console.log(data.event);

						// If server sends an error event, handle accordingly
						if (data.event === 'error') {
							dispatch({
								type: 'update_message',
								payload: {
									id,
									variant: 'chatbot',
									type: data.event,
									message: data.data,
									loading: false,
									error: true
								}
							});
							scrollToBottom(ref);
							throw new FatalError(data.data);
						}

						if (data.event === 'stream') {
							// Handle empty data fields as line breaks to preserve formatting
							if (data.data === '') {
								answer += '\n';
							} else {
								answer += data.data;
							}
							dispatch({
								type: 'update_message',
								payload: {
									id,
									variant: 'chatbot',
									message: await parseMarkdown(answer),
									sources: null,
									loading: false
								}
							});

							scrollToBottom(ref);
						} else {
							if (data.data) {
								const finalData = JSON.parse(data.data);
								//console.log(finalData);

								dispatch({
									type:
										data.event === 'is_resolved_question'
											? 'add_message'
											: 'update_message',
									payload: {
										id:
											data.event ===
											'is_resolved_question'
												? uuidv4()
												: id,
										variant: 'chatbot',
										type: data.event,
										message: await parseMarkdown(
											finalData.answer
										),
										sources: finalData.sources || null,
										answerId:
											answerId || finalData.id || null, // use saved prev id for feedback button
										conversationId: getConversationId(),
										loading: false,
										responses: finalData.options || null
									}
								});

								scrollToBottom(ref);

								answerId = finalData.id || null; // save the answer id for the feedback button
								let newChatHistory = finalData.history;

								dispatch({
									type: 'save_history',
									payload: {
										chatHistory: newChatHistory
									}
								});

								scrollToBottom(ref);

								// Scroll after full bot message and options if escalation
								if (data.event === 'support_escalation') {
									setTimeout(() => scrollToBottom(ref), 0);
								}

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

						if (currentReplyHeight - currentHeight >= 60) {
							currentHeight = currentReplyHeight;
							ref.current.scrollTop = ref.current.scrollHeight;
						}
					},
					onerror(err) {
						if (err instanceof FatalError) {
							// For fatal errors (4xx), don't retry and show error
							const errorMessage =
								err.message ||
								'There was an error with your request. Please try again.';
							const isRateLimitError = err.status === 429;

							dispatch({
								type: 'update_message',
								payload: {
									id,
									variant: 'chatbot',
									message: errorMessage,
									loading: false,
									error: true,
									isRateLimitError
								}
							});
							setIsFetching(false);
							scrollToBottom(ref);
							throw err; // Re-throw to stop the operation
						} else if (err instanceof RetriableError) {
							// Handle retriable errors
							retryCount++;

							if (retryCount > MAX_RETRIES) {
								// Too many retries, give up
								dispatch({
									type: 'update_message',
									payload: {
										id,
										variant: 'chatbot',
										message:
											'Failed to connect after several attempts. Please try again later.',
										loading: false,
										error: true
									}
								});
								setIsFetching(false);
								scrollToBottom(ref);
								throw new FatalError('Max retries exceeded');
							}

							console.log(
								`DOCSBOT: Retrying connection... Attempt ${retryCount}/${MAX_RETRIES}`
							);

							// Return delay with exponential backoff (in ms)
							return Math.min(1000 * 2 ** retryCount, 10000);
						}
					}
				});
			} catch (error) {
				console.error('DOCSBOT: Failed to fetch answer:', error);

				// Check if this is a FatalError with a specific message
				let errorMessage = 'Unknown error. Please try again later.';
				let isRateLimitError = false;
				if (error instanceof FatalError && error.message) {
					errorMessage = error.message;
					// Check if this is a rate limit error (429)
					isRateLimitError = error.status === 429;
				}

				dispatch({
					type: 'update_message',
					payload: {
						id,
						variant: 'chatbot',
						message: errorMessage,
						loading: false,
						error: true,
						isRateLimitError
					}
				});
				setIsFetching(false);
			}
		} else {
			const history = state.chatHistory || [];
			const req = {
				question,
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
						error: true
					}
				});
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
							error: true
						}
					});
				}
			};

			// Receive message from server word by word. Display the words as they are received.
			ws.onmessage = async function (event) {
				const currentReplyHeight =
					messagesRefs?.current[id]?.current?.clientHeight;
				const data = JSON.parse(event.data);
				if (data.sender === 'bot') {
					if (currentReplyHeight - currentHeight >= 80) {
						currentHeight = currentReplyHeight;
						scrollToBottom(ref);
					}
					if (data.type === 'start') {
						scrollToBottom(ref);
					} else if (data.type === 'stream') {
						//append to answer
						answer += data.message;
						dispatch({
							type: 'update_message',
							payload: {
								id,
								variant: 'chatbot',
								message: await parseMarkdown(answer),
								sources: null,
								loading: false
							}
						});
					} else if (data.type === 'info') {
					} else if (data.type === 'end') {
						const finalData = JSON.parse(data.message);
						dispatch({
							type: 'update_message',
							payload: {
								id,
								variant: 'chatbot',
								message: await parseMarkdown(finalData.answer),
								sources: finalData.sources,
								answerId: finalData.id,
								rating: finalData.rating,
								loading: false
							}
						});
						dispatch({
							type: 'save_history',
							payload: {
								chatHistory: finalData.history
							}
						});
						currentHeight = 0;
						scrollToBottom(ref);
						ws.close();
						// Change this to use native JS event
						document.dispatchEvent(
							new CustomEvent(
								'docsbot_fetching_answer_complete',
								{ detail: finalData }
							)
						);
					} else if (data.type === 'error') {
						dispatch({
							type: 'update_message',
							payload: {
								id,
								variant: 'chatbot',
								message: data.message,
								loading: false,
								error: true
							}
						});
						ws.close();
					}
				}
			};
		}
	}

	async function parseMarkdown(text) {
		// Remove incomplete markdown images, but keep the alt text
		let filteredText = text.replace(
			/!\[([^\]]*?)(?:\](?:\([^)]*)?)?$/gm,
			'$1'
		);
		// Remove incomplete markdown links, but keep the link text
		filteredText = filteredText.replace(
			/\[([^\]]*?)(?:\](?:\([^)"]*(?:"[^"]*")?[^)]*)?)?$/gm,
			'$1'
		);

		return await remark()
			.use(html)
			.use(remarkGfm)
			.use(externalLinks, { target: '_blank' })
			.process(filteredText)
			.then((html) => {
				return html.toString();
			});
	}

	async function handleSubmit(event) {
		event.preventDefault();
		if (chatInput.trim().length < minInputLength) {
			return;
		}

		// Extract thumbnails for history storage if images exist
		const historyImageUrls =
			useImageUpload && selectedImages.length > 0
				? selectedImages.map((img) => img.thumbnailUrl)
				: undefined;

		dispatch({
			type: 'add_message',
			payload: {
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

		// Wait for DOM update, then scroll
		setTimeout(() => {
			scrollToBottom(ref);
		}, 0);

		inputRef.current.focus();
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
	}, [color]);

	useEffect(() => {
		const chatContainer = ref.current;

		const handleScroll = () => {
			const atBottom =
				chatContainer.scrollTop + chatContainer.offsetHeight >=
				chatContainer.scrollHeight - 1; // small buffer
			setIsAtBottom(atBottom);
		};

		if (chatContainer) {
			chatContainer.addEventListener('scroll', handleScroll);
			// Initial check
			handleScroll();
		}

		// Clean up
		return () => {
			if (chatContainer) {
				chatContainer.removeEventListener('scroll', handleScroll);
			}
		};
	}, []);

	const [parsedFooterText, setParsedFooterText] = useState(null);

	useEffect(() => {
		async function parseFooter() {
			if (labels.footerMessage) {
				const parsed = await parseMarkdown(labels.footerMessage);
				setParsedFooterText(parsed);
			}
		}

		parseFooter();
	}, [labels.footerMessage]);

	const isWhite = ['#ffffff', '#FFFFFF', 'rgb(255, 255, 255)'].includes(
		color
	);
	const isFloatingSmall = !isEmbeddedBox && hideHeader;

	useEffect(() => {
		if (isOpen) {
			setTimeout(() => scrollToBottom(ref), 0);
		}
	}, [isOpen]);

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
			id="docsbot-chat-dialog"
			tabIndex={-1}
			{...(!isEmbeddedBox && {
				role: 'dialog',
				'aria-modal': true,
				...(logo
					? { 'aria-label': botName }
					: {
						'aria-labelledby': 'docsbot-chat-title',
						...(description ? { 'aria-describedby': 'docsbot-chat-desc' } : {})
					}
				)
			})}
		>
			<div className="docsbot-chat-container">
				<div className="docsbot-chat-inner-container">
					{!isEmbeddedBox && (
						<button
							type="button"
							className={'mobile-close-button'}
							onClick={(e) => {
								setIsOpen(false);
							}}
							aria-label={labels.close || 'Close'}
						>
							<FontAwesomeIcon size="lg" icon={faXmark} />
							<span className="mobile-close-button-label">
								{labels.close || 'Close'}
							</span>
						</button>
					)}
					<div
						className={clsx(
							'docsbot-chat-header',
							isEmbeddedBox && hideHeader && 'unbranded',
							!(
								Object.keys(state.messages).length <= 1 &&
								Object.keys(questions).length >= 1
							) && 'is-small'
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
								onClick={() => refreshChatHistory()}
								className="docsbot-chat-header-button"
							>
								<FontAwesomeIcon icon={faRefresh} />
								<span className="docsbot-screen-reader-only">
									{labels?.resetChat}
								</span>
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
											<h1 className="docsbot-chat-header-title" id="docsbot-chat-title">
												{botName}
											</h1>
											<span className="docsbot-chat-header-subtitle" id="docsbot-chat-desc">
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

					<div className="docsbot-chat-message-container" ref={ref} id="docsbot-chat-messages" role="log" aria-live="polite" aria-relevant="additions text" aria-busy={isFetching} aria-label="Chat messages" tabIndex={0}>
						{Object.keys(state.messages).map((key) => {
							const message = state.messages[key];
							message.isLast =
								key === Object.keys(state.messages).pop();
							messagesRefs.current[message.id] = createRef();
							return message.variant === 'chatbot' ? (
								<div key={key}>
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
									/>
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
								/>
							);
						})}

						{Object.keys(state.messages).length <= 1 &&
							Object.keys(questions).length >= 1 && (
								<div
									className={clsx(
										'docsbot-chat-suggested-questions-container consecutive-bot-message',
										botIcon && 'has-avatar'
									)}
								>
									<span className="docsbot-chat-suggested-questions-title">
										{labels.suggestions}
									</span>
									<div className="docsbot-chat-suggested-questions-grid">
										{Object.keys(questions).map((index) => {
											const question = questions[index];
											return (
												<button
													key={'question' + index}
													type="button"
													onClick={() => {
														dispatch({
															type: 'add_message',
															payload: {
																variant: 'user',
																message:
																	question,
																loading: false,
																timestamp:
																	Date.now()
															}
														});
														fetchAnswer(question);
														setChatInput('');
														inputRef.current.focus();
													}}
													className="docsbot-chat-suggested-questions-button"
												>
													{question}
												</button>
											);
										})}
									</div>
								</div>
							)}
					</div>

					<div className="docsbot-chat-footer">
						{!isAtBottom && (
							<button
								className={clsx(
									'docsbot-scroll-button',
									isAtBottom && 'hide'
								)}
								onClick={() => scrollToBottom(ref)}
								aria-controls="docsbot-chat-messages"
							>
								<span className="docsbot-screen-reader-only">
									Scroll to the bottom of conversation
								</span>
								<FontAwesomeIcon icon={faChevronDown} />
							</button>
						)}

						<div className="docsbot-chat-footer-inner-wrapper">
							<div className="docsbot-chat-input-container">
								<form
									className={`docsbot-chat-input-form ${chatInput.trim().length < minInputLength || isFetching ? 'has-disabled-submit' : ''}`}
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
										/>
									)}

									<div
										className={`docsbot-chat-input-wrapper ${selectedImages.length > 0 ? 'has-images' : ''} ${isDragging ? 'is-dragging' : ''} ${!useImageUpload ? 'no-image-upload' : ''}`}
									>
										<textarea
											className={`docsbot-chat-input ${!useImageUpload ? 'no-image-upload' : ''}`}
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
											maxLength={
												inputLimit
													? Math.min(inputLimit, 2000)
													: 500
												}
											rows={1}
											aria-label={labels?.inputPlaceholder || 'Type your message'}
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
												isFetching
											}
											aria-label="Upload image"
										>
											<FontAwesomeIcon icon={faImage} />
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
												minInputLength || isFetching
										}
									>
										<FontAwesomeIcon
											icon={faPaperPlane}
											className="docsbot-chat-btn-send-icon"
										/>
									</button>
								</form>
							</div>

							{(branding || parsedFooterText?.trim()) && (
								<div className="docsbot-chat-credits">
									{parsedFooterText?.trim() &&
										(keepFooterVisible || Object.keys(state.messages).length <=
											1) && (
											<div
												className="docsbot-chat-credits--policy"
												dangerouslySetInnerHTML={{
													__html: parsedFooterText
												}}
											/>
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
			</div>
		</div>
	);
};
