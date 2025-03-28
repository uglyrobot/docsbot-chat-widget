/** @format */

import { useEffect, useRef, useState, createRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { remark } from "remark";
import html from "remark-html";
import remarkGfm from "remark-gfm";
import externalLinks from "remark-external-links";
import { useChatbot } from "../chatbotContext/ChatbotContext";
import { useConfig } from "../configContext/ConfigContext";
import { BotChatMessage } from "../botChatMessage/BotChatMessage";
import { UserChatMessage } from "../userChatMessage/UserChatMessage";
import { SendIcon } from "../icons/SendIcon";
import { Options } from "../options/Options";
import { DocsBotLogo } from "../icons/DocsBotLogo";
import { getLighterColor, decideTextColor } from "../../utils/colors";
import clsx from "clsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faRefresh } from "@fortawesome/free-solid-svg-icons";
import { Emitter } from "../../utils/event-emitter";

export const Chatbot = ({ isOpen, setIsOpen, isEmbeddedBox }) => {
  const [chatInput, setChatInput] = useState("");
  const { dispatch, state } = useChatbot();
  const {
    color,
    teamId,
    botId,
    signature,
    botName,
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
  } = useConfig();
  const ref = useRef();
  const inputRef = useRef();
  const mediaMatch = window.matchMedia("(min-width: 480px)");
  const messagesRefs = useRef({});

  useEffect(() => {
    Emitter.on("docsbot_add_user_message", async ({ message, send }) => {
      await dispatch({
        type: "add_message",
        payload: {
          variant: "user",
          message: message,
          loading: false,
          timestamp: Date.now(),
        },
      });

      if (send) {
        fetchAnswer(message);
      }

      Emitter.emit("docsbot_add_user_message_complete");
    });

    Emitter.on("docsbot_add_bot_message", async ({ message }) => {
      await dispatch({
        type: "add_message",
        payload: {
          id: uuidv4(),
          variant: "chatbot",
          message: await parseMarkdown(message),
          loading: false,
          timestamp: Date.now(),
        },
      });

      Emitter.emit("docsbot_add_bot_message_complete");
    });

    Emitter.on("docsbot_clear_history", async () => {
      await refreshChatHistory();
      Emitter.emit("docsbot_clear_history_complete");
    });

    // Clean up event listeners
    return () => {
      Emitter.off("docsbot_add_user_message");
      Emitter.off("docsbot_add_bot_message");
      Emitter.off("docsbot_clear_history");
    };
  }, []);

  const refreshChatHistory = async () => {
    dispatch({ type: "clear_messages" });
    localStorage.removeItem(`${botId}_docsbot_chat_history`);
    localStorage.removeItem(`${botId}_chatHistory`);

    const parsedMessage = await parseMarkdown(labels.firstMessage);

    dispatch({
      type: "add_message",
      payload: {
        id: uuidv4(),
        variant: "chatbot",
        message: parsedMessage,
        timestamp: Date.now(),
      },
    });
  };

  useEffect(() => {
    const addFistMessage = async () => {
      const parsedMessage = await parseMarkdown(labels.firstMessage);

      dispatch({
        type: "add_message",
        payload: {
          id: uuidv4(),
          variant: "chatbot",
          message: parsedMessage,
          timestamp: Date.now(),
        },
      });
    };

    const fetchData = async () => {
      const savedConversation = JSON.parse(
        localStorage.getItem(`${botId}_docsbot_chat_history`)
      );
      const chatHistory = JSON.parse(
        localStorage.getItem(`${botId}_chatHistory`)
      );
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
              type: "load_conversation",
              payload: { savedConversation: savedConversation },
            });
          }
        } else {
          await addFistMessage();
        }
      } else if (labels.firstMessage) {
        console.log(labels.firstMessage);
        await addFistMessage();
      }

      if (chatHistory) {
        dispatch({
          type: "save_history",
          payload: {
            chatHistory: chatHistory,
          },
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
      `${botId}_docsbot_chat_history`,
      JSON.stringify(state.messages)
    );
  }, [state.messages]);

  useEffect(() => {
    if (state.chatHistory) {
      localStorage.setItem(
        `${botId}_chatHistory`,
        JSON.stringify(state?.chatHistory)
      );
    }

  }, [state.chatHistory]);

  function fetchAnswer(question) {
    const id = uuidv4();

    dispatch({
      type: "add_message",
      payload: {
        id,
        variant: "chatbot",
        message: null,
        loading: true,
        timestamp: Date.now(),
      },
    });

    // Change this to use native JS event
    document.dispatchEvent(new CustomEvent("docsbot_fetching_answer", { detail: { question } }));

    // Add null check before accessing scrollHeight
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }

    let currentHeight = 0;
    let answer = "";
    let metadata = identify;
    metadata.referrer = window.location.href;
    const history = state.chatHistory || [];
    const req = {
      question,
      markdown: true,
      history,
      metadata,
      context_items: contextItems || 5,
    };
    if (signature) {
      req.auth = signature;
    }

    const apiUrl = `wss://api.docsbot.ai/teams/${teamId}/bots/${botId}/chat`;
    //const apiUrl = `ws://127.0.0.1:9000/teams/${teamId}/bots/${botId}/chat`;
    const ws = new WebSocket(apiUrl);

    // Send message to server when connection is established
    ws.onopen = function (event) {
      ws.send(JSON.stringify(req));
    };

    ws.onerror = function (event) {
      console.error("DOCSBOT: WebSocket error", event);
      dispatch({
        type: "update_message",
        payload: {
          id,
          variant: "chatbot",
          message: "There was a connection error. Please try again.",
          loading: false,
          error: true,
        },
      });
    };

    ws.onclose = function (event) {
      if (!event.wasClean) {
        dispatch({
          type: "update_message",
          payload: {
            id,
            message: "There was a network error. Please try again.",
            loading: false,
            error: true,
          },
        });
      }
    };

    // Receive message from server word by word. Display the words as they are received.
    ws.onmessage = async function (event) {
      const currentReplyHeight =
        messagesRefs?.current[id]?.current?.clientHeight;
      const data = JSON.parse(event.data);
      if (data.sender === "bot") {
        if (currentReplyHeight - currentHeight >= 80) {
          currentHeight = currentReplyHeight;
          if (ref.current) {
            ref.current.scrollTop = ref.current.scrollHeight;
          }
        }
        if (data.type === "start") {
          if (ref.current) {
            ref.current.scrollTop = ref.current.scrollHeight;
          }
        } else if (data.type === "stream") {
          //append to answer
          answer += data.message;
          dispatch({
            type: "update_message",
            payload: {
              id,
              variant: "chatbot",
              message: await parseMarkdown(answer),
              sources: null,
              loading: false,
            },
          });
        } else if (data.type === "info") {
        } else if (data.type === "end") {
          const finalData = JSON.parse(data.message);
          dispatch({
            type: "update_message",
            payload: {
              id,
              variant: "chatbot",
              message: await parseMarkdown(finalData.answer),
              sources: finalData.sources,
              answerId: finalData.id,
              rating: finalData.rating,
              loading: false,
            },
          });
          dispatch({
            type: "save_history",
            payload: {
              chatHistory: finalData.history,
            },
          });
          currentHeight = 0;
          if (ref.current) {
            ref.current.scrollTop = ref.current.scrollHeight;
          }
          ws.close();
          // Change this to use native JS event
          document.dispatchEvent(new CustomEvent("docsbot_fetching_answer_complete", { detail: finalData }));
        } else if (data.type === "error") {
          dispatch({
            type: "update_message",
            payload: {
              id,
              variant: "chatbot",
              message: data.message,
              loading: false,
              error: true,
            },
          });
          ws.close();
        }
      }
    };
  }

  async function parseMarkdown(text) {
    // Remove incomplete markdown images, but keep the alt text
    let filteredText = text.replace(/!\[([^\]]*?)(?:\](?:\([^)]*)?)?$/gm, "$1");
    // Remove incomplete markdown links, but keep the link text
    filteredText = filteredText.replace(
      /\[([^\]]*?)(?:\](?:\([^)"]*(?:"[^"]*")?[^)]*)?)?$/gm,
      "$1"
    );

    return await remark()
      .use(html)
      .use(remarkGfm)
      .use(externalLinks, { target: "_blank" })
      .process(filteredText)
      .then((html) => {
        return html.toString();
      });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    dispatch({
      type: "add_message",
      payload: {
        variant: "user",
        message: chatInput,
        loading: false,
        timestamp: Date.now(),
      },
    });

    fetchAnswer(chatInput);
    setChatInput("");
    inputRef.current.focus();
  }

  useEffect(() => {
	const root = document.documentElement;
	const primaryColor = color || "#1292EE";

	root.style.setProperty('--docsbot-color-main', primaryColor);

	root.style.setProperty('--docsbot-header--bg', primaryColor);
	root.style.setProperty('--docsbot-header--color', decideTextColor(primaryColor));

	root.style.setProperty('--docsbot-reset-button--bg', primaryColor);
	root.style.setProperty('--docsbot-reset-button--color', decideTextColor(primaryColor));
  }, [color]);

  return (
    <div
      className={clsx(
        alignment === "left" ? "docsbot-left" : "",
        "docsbot-wrapper",
		isEmbeddedBox ? "docsbot-embedded" : "docsbot-floating"
      )}
      style={
        mediaMatch.matches
          ? {
              left: alignment === "left" ? horizontalMargin || 20 : "auto",
              right: alignment === "right" ? horizontalMargin || 20 : "auto",
              bottom: verticalMargin ? verticalMargin + 80 : 100,
            }
          : {}
      }
      part="wrapper"
    >
      <div className="docsbot-chat-container">
        <div className="docsbot-chat-inner-container">
          {!isEmbeddedBox && (
            <a
              role="button"
              className={"mobile-close-button"}
              onClick={(e) => {
                e.preventDefault();
                setIsOpen(false);
              }}
              sr-label="Close chat"
            >
              <FontAwesomeIcon size="lg" icon={faXmark} />
              <span className="mobile-close-button-label">
                {labels.close || "Close"}
              </span>
            </a>
          )}
          <div
			className={clsx(
				"docsbot-chat-header",
				(isEmbeddedBox && hideHeader) && "unbranded",
				!(Object.keys(state.messages).length <= 1 && Object.keys(questions).length >= 1) && "is-small"
			)}
          >
            <div className="docsbot-chat-header-inner" style={{ width: "100%" }}>
              <button
                onClick={() => refreshChatHistory()}
				className="docsbot-chat-header-button"
              >
                <FontAwesomeIcon icon={faRefresh} />
				<span className="docsbot-screen-reader-only">{labels?.resetChat}</span>
              </button>
              <div
                className="docsbot-chat-header-content"
                style={{
                  textAlign: headerAlignment === "left" ? "left" : "center",
                }}
              >
				{!(isEmbeddedBox && hideHeader) && (
					logo
						? (
							<div
								className="docsbot-chat-header-branded"
								style={{
									justifyContent:
										headerAlignment === "left" ? "start" : "center",
								}}>
									<img src={logo} alt={botName} />
							</div>
						)
						: (
							<>
								<h1 className="docsbot-chat-header-title">{botName}</h1>
								<span className="docsbot-chat-header-subtitle">{description}</span>
							</>
						)
				)}
              </div>
			  {!isEmbeddedBox && (
				<div className="docsbot-chat-header-background-wrapper">
					<div className="docsbot-chat-header-background" />
				</div>
			  )}
            </div>
          </div>

          <div className="docsbot-chat-message-container" ref={ref}>
            {Object.keys(state.messages).map((key) => {
              const message = state.messages[key];
              message.isLast = key === Object.keys(state.messages).pop();
              messagesRefs.current[message.id] = createRef();
              return message.variant === "chatbot" ? (
                <div key={key}>
                  <BotChatMessage
                    payload={message}
                    messageBoxRef={messagesRefs.current[message.id]}
                  />
                  {message?.options ? (
                    <Options key={key + "opts"} options={message.options} />
                  ) : null}
                </div>
              ) : (
                <UserChatMessage
                  key={key}
                  loading={message.loading}
                  message={message.message}
                />
              );
            })}
            {Object.keys(state.messages).length <= 1 &&
              Object.keys(questions).length >= 1 && (
                <div className="docsbot-chat-suggested-questions-container">
                  <span
                    style={{
                      color: decideTextColor(
                        getLighterColor(color || "#1292EE", 0.93)
                      ),
                    }}
                  >
                    {labels.suggestions}
                  </span>
				  <div className="docsbot-chat-suggested-questions-grid">
                  {Object.keys(questions).map((index) => {
                    const question = questions[index];
                    return (
                      <button
                        key={"question" + index}
                        type="button"
                        onClick={() => {
                          dispatch({
                            type: "add_message",
                            payload: {
                              variant: "user",
                              message: question,
                              loading: false,
                              timestamp: Date.now(),
                            },
                          });
                          fetchAnswer(question);
                          setChatInput("");
                        }}
                        {...(["#ffffff", "#FFFFFF", "rgb(255, 255, 255)"].includes(color) && {style: {borderColor: "#d8d8d8"}})}
                      >
                        {question}
                      </button>
                    );
                  })}
				  </div>
                </div>
              )}
            {branding && (
              <div className="docsbot-chat-credits">
                <a
                  href="https://docsbot.ai?utm_source=chatbot&utm_medium=chatbot&utm_campaign=chatbot"
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={labels.poweredBy + " DocsBot"}
                >
                  {labels.poweredBy} <DocsBotLogo />
                </a>
              </div>
            )}
          </div>
          <div className="docsbot-chat-input-container">
            <form className="docsbot-chat-input-form" onSubmit={handleSubmit}>
              <textarea
                className="docsbot-chat-input"
                placeholder={labels.inputPlaceholder}
                value={chatInput}
				onFocus={(e) => {
					const textarea = e.target;
					const form = textarea.parentNode;
					const container = form.parentNode;

					container.classList.add("focused");
				}}
				onBlur={(e) => {
					const textarea = e.target;
					const form = textarea.parentNode;
					const container = form.parentNode;

					container.classList.remove("focused"); // remove focused class
				}}
                onChange={(e) => {
                  setChatInput(e.target.value);

                  e.target.style.height = "auto";

				  // get the computed style of the textarea
				  const computed = window.getComputedStyle(e.target);
				  const padding = parseInt(computed.paddingTop) + parseInt(computed.paddingBottom);

				  if (e.target.scrollHeight > 54) {
					e.target.style.height = e.target.scrollHeight - padding + "px";
				  }
                }}
                onKeyDown={(e) => {
                  //this detects if the user is typing in a IME session (ie Kanji autocomplete) to avoid premature submission
                  if (e.isComposing || e.keyCode === 229) {
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    handleSubmit(e);
                    e.target.style.height = "auto";
                  }
                }}
                ref={inputRef}
                maxLength={inputLimit ? Math.min(inputLimit, 2000) : 500}
                rows={1}
              />
              <button
                type="submit"
                className="docsbot-chat-btn-send"
				{...(["#ffffff", "#FFFFFF", "rgb(255, 255, 255)"].includes(color) && {style: {fill: "inherit"}})}
                disabled={chatInput.length < 2}
              >
                <SendIcon />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
