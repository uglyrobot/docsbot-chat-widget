/** @format */

import { useEffect, useRef, useState } from "react";
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

export const Chatbot = ({ isOpen, setIsOpen, isEmbeddedBox }) => {
  const [chatInput, setChatInput] = useState("");
  const [refreshChat, setRefreshChat] = useState(false);
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
    leadCollectionOptions
  } = useConfig();
  const ref = useRef();
  const inputRef = useRef();
  const suppportTabRef = useRef()
  const mediaMatch = window.matchMedia("(min-width: 480px)");

  useEffect(() => {
    const fetchData = async () => {
      if (refreshChat) {
        dispatch({ type: "clear_messages" });
        localStorage.removeItem("docsbot_chat_history");
        localStorage.removeItem("chatHistory");
        setRefreshChat((prevState) => !prevState);
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
        const userDetails = JSON.parse(localStorage.getItem('userContactDetails'))
        if (!userDetails && leadCollectionOptions.immediately) {
          setShowSupportMessage(true)
        }
        else {
          setShowSupportMessage(false)
        }
      }
    };

    fetchData();
  }, [refreshChat]);

  useEffect(() => {
    let supportbtnTimout = null
    const fetchData = async () => {
      const savedConversation = JSON.parse(
        localStorage.getItem("docsbot_chat_history")
      );
      const savedConversationArray = Object.values(savedConversation)
      const userDetails = JSON.parse(localStorage.getItem('userContactDetails'))
      if (userDetails) {
        updateIdentify(userDetails)
      }
      if (!userDetails) {
        if (leadCollectionOptions.immediately && savedConversationArray?.length === 1) {
          setTimeoutLoader(true)
          supportbtnTimout = setTimeout(() => {
            setShowSupportMessage(true)
            setTimeoutLoader(false)
          }, 1000)
        }
        else {
          setShowSupportMessage(false)
        }
      }
      const chatHistory = JSON.parse(localStorage.getItem('chatHistory'))
      const currentTime = Date.now()
      let lastMsgTimeStamp = 0
      if (savedConversation) {
        if (savedConversationArray) {
          const lastConversation = savedConversationArray[savedConversationArray.length - 1]
          if (lastConversation?.isFeedback && !lastConversation?.isFirstMessage && !lastConversation?.isHumanSupport) {
            setShowFeedbackButton(true)
          }
          if (!lastConversation?.isFeedback && !lastConversation?.isFirstMessage && lastConversation?.isHumanSupport) {
            setShowHumanButton(true)
          }
        }
        savedConversationArray?.map(message => {
          if (message?.timestamp > lastMsgTimeStamp) {
            lastMsgTimeStamp = message?.timestamp
          }
        });
        if (currentTime - lastMsgTimeStamp > 12 * 60 * 60 * 1000) {
          setRefreshChat(true);
        } else {
          dispatch({
            type: "load_conversation",
            payload: { savedConversation: savedConversation },
          });
        }
      }

      if (savedConversation == null && labels.firstMessage) {
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
    return () => {
      clearTimeout(supportbtnTimout)
    }
  }, [labels.firstMessage]);

  useEffect(() => {
    localStorage.setItem(
      "docsbot_chat_history",
      JSON.stringify(state.messages)
    );
  }, [state.messages]);

  useEffect(() => {
    if (state.chatHistory?.length) {
      localStorage.setItem(
        "chatHistory",
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
    ref.current.scrollTop = ref.current.scrollHeight;

    let answer = "";
    let metadata = identify;
    metadata.referrer = window.location.href;
    const sse_req = {
      question,
      format: 'markdown',
      full_source: false,
      metadata,
      conversationId: id,
    }
    if (signature) {
      sse_req.auth = signature;
    }
    await fetchEventSource(`https://api.docsbot.ai/teams/${teamId}/bots/${botId}/chat-agent`, {
      headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify(sse_req),
      async onmessage(event) {
        const data = event;
        if (data.event === "start") {
          ref.current.scrollTop = ref.current.scrollHeight;
        }
        else if (data.event === "support_escalation") {
          setShowHumanButton(true)
          answer += data.data;
          dispatch({
            type: "update_message",
            payload: {
              id,
              variant: "chatbot",
              message: await parseMarkdown(answer),
              sources: null,
              loading: false,
              isHumanSupport: true
            },
          });
        }
        else if (data.event === "is_resolved_question") {
          setShowFeedbackButton(true)
          const finalData = JSON.parse(data.data);
          dispatch({
            type: "update_message",
            payload: {
              variant: "chatbot",
              message: await parseMarkdown(finalData.answer),
              sources: null,
              loading: false,
              isHumanSupport: false,
              isFeedback: true,
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
          if (data.data?.includes('\n')) {
            console.log(data, 'nknbhjbhjb');
            ref.current.scrollTop = ref.current.scrollHeight;
          }
        } else if (data.event === "lookup_answer") {
          const finalData = JSON.parse(data.data);
          dispatch({
            type: "update_message",
            payload: {
              id,
              variant: "chatbot",
              message: await parseMarkdown(finalData.answer),
              sources: finalData.sources,
              answerId: finalData.id,
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
          const userDetails = JSON.parse(localStorage.getItem('userContactDetails'))
          ref.current.scrollTop = ref.current.scrollHeight;
        } else if (data.event === "error") {
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
        }
      },
      onerror() {
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
      },
    }
    )

  }

  async function parseMarkdown(text) {
    return await remark()
      .use(html)
      .use(remarkGfm)
      .use(externalLinks, { target: "_blank" })
      .process(text)
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
              (isEmbeddedBox && hideHeader)
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
                onClick={() => setRefreshChat(!refreshChat)}
                title="Reset conversation"
                style={(isEmbeddedBox && hideHeader) ? { top: "2px" } : { top: "5px" }}
              >
                <FontAwesomeIcon icon={faRefresh} />
              </button>
              <div
                className="docsbot-chat-header-content"
                style={{
                  textAlign: headerAlignment === "left" ? "left" : "center",
                }}
              >
                {(isEmbeddedBox && hideHeader) ? null : logo ? (
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
              return message.variant === "chatbot" ? (
                <div key={key}>
                  <BotChatMessage payload={message} showSupportMessage={showSupportMessage} setShowSupportMessage={setShowSupportMessage} fetchAnswer={fetchAnswer} showFeedbackButton={showFeedbackButton} showHumanButton={showHumanButton} suppportTabRef={suppportTabRef}
                    timeoutLoader={timeoutLoader}
                    setTimeoutLoader={setTimeoutLoader}
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
                  {Object.keys(questions).map((index) => {
                    const question = questions[index];
                    return (
                      <button
                        key={"question" + index}
                        type="button"
                        disabled={showSupportMessage}
                        onClick={() => {
                          if (leadCollectionOptions.ask) {
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
                if (leadCollectionOptions.ask) {
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
                      if (leadCollectionOptions.ask) {
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
                maxLength={200}
                rows={1}
              />
              {
                !color?.includes('fff') ? <button
                  type="submit"
                  className="docsbot-chat-btn-send"
                  style={{
                    fill: color,
                  }}
                  disabled={chatInput.length < 2 || showSupportMessage}
                >
                  <SendIcon />
                </button> : null
              }
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
