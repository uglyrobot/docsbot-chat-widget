/** @format */

import { createRef, useEffect, useRef, useState } from "react";
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
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { Emitter } from "../../utils/event-emitter";

// Define error classes for fetchEventSource
class RetriableError extends Error { }
class FatalError extends Error { }

export const Chatbot = ({ isOpen, setIsOpen, isEmbeddedBox }) => {
  const [chatInput, setChatInput] = useState("");
  const [showSupportMessage, setShowSupportMessage] = useState(false)
  const [showFeedbackButton, setShowFeedbackButton] = useState(false)
  const [showHumanButton, setShowHumanButton] = useState(false)
  const [timeoutLoader, setTimeoutLoader] = useState(false)
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
    updateIdentify,
    collectLead,
    inputLimit,
    contextItems,
  } = useConfig();
  const ref = useRef();
  const inputRef = useRef();
  const suppportTabRef = useRef()
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
        isFirstMessage: true
      },
    });

    setShowSupportMessage(false);
    setShowFeedbackButton(false);
    setShowHumanButton(false);
    
    const userDetails = JSON.parse(localStorage.getItem('userContactDetails'));
    if (!userDetails && collectLead === "immediately") {
      setTimeoutLoader(true);
      setTimeout(() => {
        setShowSupportMessage(true);
        setTimeoutLoader(false);
      }, 1000);
    }
  };

  useEffect(() => {
    let supportbtnTimout = null;
    const fetchData = async () => {
      const savedConversation = JSON.parse(
        localStorage.getItem(`${botId}_docsbot_chat_history`)
      );
      const savedConversationArray = Object.values(savedConversation || {});
      const userDetails = JSON.parse(localStorage.getItem('userContactDetails'));
      
      if (userDetails) {
        updateIdentify(userDetails);
      }
      
      if (!userDetails) {
        if (collectLead === "immediately" && savedConversationArray?.length === 1) {
          setTimeoutLoader(true);
          supportbtnTimout = setTimeout(() => {
            setShowSupportMessage(true);
            setTimeoutLoader(false);
          }, 1000);
        } else {
          setShowSupportMessage(false);
        }
      }
      
      const chatHistory = JSON.parse(
        localStorage.getItem(`${botId}_chatHistory`)
      );
      const currentTime = Date.now();
      let lastMsgTimeStamp = 0;
      
      if (savedConversation) {
        if (savedConversationArray) {
          const lastConversation = savedConversationArray[savedConversationArray.length - 1];
          if (lastConversation?.isFeedback && !lastConversation?.isFirstMessage && !lastConversation?.isHumanSupport) {
            setShowFeedbackButton(true);
          }
          if (!lastConversation?.isFeedback && !lastConversation?.isFirstMessage && lastConversation?.isHumanSupport) {
            setShowHumanButton(true);
          }
          
          savedConversationArray.forEach(message => {
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
        }
      } else if (labels.firstMessage) {
        refreshChatHistory();
      }
      
      if (chatHistory) {
        dispatch({
          type: "save_history",
          payload: {
            chatHistory: chatHistory,
          },
        });
      }
      
      // Only focus on input if not mobile
      if (mediaMatch.matches && !isEmbeddedBox) {
        inputRef.current.focus();
      }
    };
    
    fetchData();
    
    return () => {
      clearTimeout(supportbtnTimout);
    };
  }, [labels.firstMessage]);

  useEffect(() => {
    localStorage.setItem(
      `${botId}_docsbot_chat_history`,
      JSON.stringify(state.messages)
    );
  }, [state.messages]);

  useEffect(() => {
    if (state.chatHistory?.length) {
      localStorage.setItem(
        `${botId}_chatHistory`,
        JSON.stringify(state?.chatHistory)
      );
    }
  }, [state.chatHistory]);

  async function fetchAnswer(question) {
    setShowSupportMessage(false)
    setShowFeedbackButton(false)
    setShowHumanButton(false)
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
    ref.current.scrollTop = ref.current.scrollHeight;
    let answer = "";
    let metadata = identify;
    metadata.referrer = window.location.href;
    const sse_req = {
      stream: true,
      question,
      format: 'markdown',
      human_escalation: true,
      followup_rating: true,
      document_retriever: true,
      full_source: false,
      metadata,
      conversationId: id,
      context_items: contextItems || 6,
      
    }
    if (signature) {
      sse_req.auth = signature;
    }
    
    // Track retry attempts - start at 0 so we get a total of 3 attempts (initial + 2 retries)
    let retryCount = 0;
    const MAX_RETRIES = 2;
    
    try {
      await fetchEventSource(`https://api.docsbot.ai/teams/${teamId}/bots/${botId}/chat-agent`, {
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json',
        },
        method: 'POST',
        body: JSON.stringify(sse_req),
        async onopen(response) {
          // Check if the response is valid
          if (response.ok) {
            return; // Connection established successfully
          } else if (response.status >= 400 && response.status < 500) {
            // All client-side errors (including 429) are not retriable
            let errorMessage = `HTTP error ${response.status}`;
            
            // Try to extract error message from response body
            try {
              const responseBody = await response.text();
              const parsedBody = JSON.parse(responseBody);
              
              if (parsedBody && parsedBody.error) {
                errorMessage = parsedBody.error;
              }
            } catch (e) {
              // If we can't parse the body, just use the default error message
              console.error("Failed to parse error response:", e);
            }
            
            throw new FatalError(errorMessage);
          } else {
            // Server errors or network issues should be retried
            throw new RetriableError(`HTTP error ${response.status}`);
          }
        },
        async onmessage(event) {
          const currentReplyHeight = messagesRefs?.current[id]?.current?.clientHeight
          const data = event;
          console.log(data.event)
          
          // If server sends an error event, handle accordingly
          if (data.event === "error") {
            dispatch({
              type: "update_message",
              payload: {
                id,
                variant: "chatbot",
                message: data.data,
                loading: false,
                error: true,
              },
            });
            throw new FatalError(data.data);
          }
          
          if (data.event === "support_escalation") {
            setShowHumanButton(true)
            const finalData = JSON.parse(data.data);
            console.log(finalData)
            dispatch({
              type: "add_message",
              payload: {
                id,
                variant: "chatbot",
                message: await parseMarkdown(finalData.answer),
                sources: null,
                loading: false,
                isHumanSupport: finalData.option
              },
            });
          }
          else if (data.event === "is_resolved_question") {
            setShowFeedbackButton(true)
            const finalData = JSON.parse(data.data);
            console.log(finalData)
            dispatch({
              type: "add_message",
              payload: {
                variant: "chatbot",
                message: await parseMarkdown(finalData.answer),
                sources: null,
                loading: false,
                isHumanSupport: false,
                isFeedback: finalData.option,
              },
            });
          }
          else if (data.event === "stream") {
            //append to answer
            answer += data.data;
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
            if (currentReplyHeight - currentHeight >= 20) {
              currentHeight = currentReplyHeight
              ref.current.scrollTop = ref.current.scrollHeight;
            }
          } else if (data.event === "lookup_answer" || data.event === "answer") {
            const finalData = JSON.parse(data.data);
            console.log(finalData)
            dispatch({
              type: "update_message",
              payload: {
                id,
                variant: "chatbot",
                message: await parseMarkdown(finalData.answer),
                sources: finalData.sources || null,
                answerId: finalData.id || null,
                loading: false,
              },
            });
            let newChatHistory = []
            if (state.chatHistory?.length) {
              newChatHistory = [...state?.chatHistory, finalData.history[0]]
            }
            else {
              newChatHistory = finalData.history
            }
            dispatch({
              type: "save_history",
              payload: {
                chatHistory: newChatHistory,
              },
            });
            ref.current.scrollTop = ref.current.scrollHeight;
            currentHeight = 0
            
            // Change this to use native JS event
            document.dispatchEvent(new CustomEvent("docsbot_fetching_answer_complete", { detail: finalData }));
          }
        },
        onerror(err) {
          if (err instanceof FatalError) {
            // For fatal errors (4xx), don't retry and show error
            dispatch({
              type: "update_message",
              payload: {
                id,
                variant: "chatbot",
                // Use the error message from the server if available
                message: err.message || "There was an error with your request. Please try again.",
                loading: false,
                error: true,
              },
            });
            throw err; // Re-throw to stop the operation
          } else if (err instanceof RetriableError) {
            // Handle retriable errors
            retryCount++;
            
            if (retryCount > MAX_RETRIES) {
              // Too many retries, give up
              dispatch({
                type: "update_message",
                payload: {
                  id,
                  variant: "chatbot",
                  message: "Failed to connect after several attempts. Please try again later.",
                  loading: false,
                  error: true,
                },
              });
              throw new FatalError('Max retries exceeded');
            }
            
            console.log(`Retrying connection... Attempt ${retryCount}/${MAX_RETRIES}`);
            
            // Return delay with exponential backoff (in ms)
            return Math.min(1000 * 2 ** retryCount, 10000);
          }
        }
      });
    } catch (error) {
      console.error("Failed to fetch answer:", error);
      // Error already handled in onerror callback
    }
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

  return (
    <div
      className={clsx(
        alignment === "left" ? "docsbot-left" : "",
        "docsbot-wrapper"
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
            className="docsbot-chat-header"
            style={
              isEmbeddedBox && hideHeader
                ? {
                    backgroundColor: "transparent",
                    color: "rgb(103, 58, 183)",
                  }
                : {
                    backgroundColor: color,
                    color: decideTextColor(color || "#1292EE"),
                  }
            }
          >
            <div style={{ width: "100%" }}>
              <button
                onClick={() => refreshChatHistory()}
                title={labels?.resetChat}
                style={
                  isEmbeddedBox && hideHeader ? { top: "2px" } : { top: "5px" }
                }
              >
                <FontAwesomeIcon icon={faRefresh} />
              </button>
              <div
                className="docsbot-chat-header-content"
                style={{
                  textAlign: headerAlignment === "left" ? "left" : "center",
                }}
              >
                {isEmbeddedBox && hideHeader ? null : logo ? (
                  <div
                    className="docsbot-chat-header-branded"
                    style={{
                      justifyContent:
                        headerAlignment === "left" ? "start" : "center",
                    }}
                  >
                    <img src={logo} alt={botName} />
                  </div>
                ) : (
                  <>
                    <h1>{botName}</h1>
                    <span>{description}</span>
                  </>
                )}
              </div>
              <div className="docsbot-chat-header-background-wrapper">
                <div
                  className="docsbot-chat-header-background"
                  style={{
                    backgroundColor: isEmbeddedBox ? "transparent" : color,
                  }}
                ></div>
              </div>
            </div>
          </div>

          <div className="docsbot-chat-message-container" ref={ref}>
            {Object.keys(state.messages).map((key) => {
              const message = state.messages[key];
              message.isLast = key === Object.keys(state.messages).pop();
              messagesRefs.current[message.id] = createRef();
              messagesRefs.current[message.id] = createRef();
              return message.variant === "chatbot" ? (
                <div key={key}>
                  <BotChatMessage
                    payload={message}
                    showSupportMessage={showSupportMessage}
                    setShowSupportMessage={setShowSupportMessage}
                    fetchAnswer={fetchAnswer}
                    showFeedbackButton={showFeedbackButton}
                    showHumanButton={showHumanButton}
                    suppportTabRef={suppportTabRef}
                    timeoutLoader={timeoutLoader}
                    setTimeoutLoader={setTimeoutLoader}
                    messageBoxRef={messagesRefs.current[message.id]}
                  />
                  {message?.options ? (
                    <Options key={key + "opts"} options={message.options} />
                  ) : null}
                </div>
              )
                : (
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
                  {Object.keys(questions).map((index) => {
                    const question = questions[index];
                    return (
                      <button
                        key={"question" + index}
                        type="button"
                        disabled={showSupportMessage}
                        onClick={() => {
                          const userDetails = JSON.parse(localStorage.getItem('userContactDetails'))
                          if (collectLead === "ask" && !userDetails) {
                            setTimeoutLoader(true)
                            setTimeout(() => {
                              setShowSupportMessage(true)
                              setTimeoutLoader(false)
                            }, 1000)
                          }
                          else {
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
                          }
                        }}
                        style={{
                          backgroundColor: getLighterColor(
                            color || "#1292EE",
                            0.95
                          ),
                          color: decideTextColor(
                            getLighterColor(color || "#1292EE", 0.95)
                          ),
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.backgroundColor = getLighterColor(
                            color || "#1292EE"
                          );
                          e.target.style.border = `0.5px solid ${getLighterColor(
                            color || "#1292EE"
                          )}`;
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.backgroundColor = getLighterColor(
                            color || "#1292EE",
                            0.95
                          );
                          e.target.style.border =
                            "0.5px solid rgb(145, 145, 145)";
                        }}
                      >
                        {question}
                      </button>
                    );
                  })}
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
            <form className="docsbot-chat-input-form" onSubmit={(e) => {
              if (showSupportMessage) {
                e.preventDefault()
                suppportTabRef.current?.scrollIntoView({ behavior: 'smooth' })
              }
              else {
                const userDetails = JSON.parse(localStorage.getItem('userContactDetails'))
                if (collectLead === "ask" && !userDetails) {
                  e.preventDefault()
                  setTimeoutLoader(true)
                  setTimeout(() => {
                    setShowSupportMessage(true)
                    setTimeoutLoader(false)
                  }, 1000)
                }
                else {
                  handleSubmit(e)
                }
              }
            }}>
              <textarea
                className="docsbot-chat-input"
                placeholder={labels.inputPlaceholder}
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);

                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight - 25 + "px"; // Adjust the textarea's height to wrap the input text
                }}
                onKeyDown={(e) => {
                  //this detects if the user is typing in a IME session (ie Kanji autocomplete) to avoid premature submission
                  if (e.isComposing || e.keyCode === 229) {
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    if (showSupportMessage) {
                      e.preventDefault()
                      suppportTabRef.current?.scrollIntoView({ behavior: 'smooth' })
                    }
                    else {
                      const userDetails = JSON.parse(localStorage.getItem('userContactDetails'))
                      if (collectLead === "ask" && !userDetails) {
                        setTimeoutLoader(true)
                        setTimeout(() => {
                          setShowSupportMessage(true)
                          setTimeoutLoader(false)
                        }, 1000)
                      }
                      else {
                        handleSubmit(e);
                        e.target.style.height = "auto";
                      }
                    }
                  }
                }}
                ref={inputRef}
                maxLength={inputLimit ? Math.min(inputLimit, 2000) : 500}
                rows={1}
              />
              <button
                type="submit"
                className="docsbot-chat-btn-send"
                style={{
                  fill: ["#ffffff", "#FFFFFF", "rgb(255, 255, 255)"].includes(
                    color
                  )
                    ? "inherit"
                    : color,
                }}
                disabled={chatInput.length < 2 || showSupportMessage}
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
