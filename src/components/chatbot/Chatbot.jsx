import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { remark } from "remark";
import html from "remark-html";
import remarkGfm from "remark-gfm";
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
import { faXmark } from "@fortawesome/free-solid-svg-icons";

export const Chatbot = ({ isOpen, setIsOpen }) => {
  const [chatInput, setChatInput] = useState("");
  const { dispatch, state } = useChatbot();
  const {
    color,
    teamId,
    botId,
    botName,
    description,
    branding,
    labels,
    alignment,
    questions,
  } = useConfig();
  const ref = useRef();
  const inputRef = useRef();

  useEffect(() => {
    if (labels.firstMessage) {
      dispatch({
        type: "add_message",
        payload: {
          id: uuidv4(),
          variant: "chatbot",
          message: labels.firstMessage,
        },
      });
    }
    inputRef.current.focus();
  }, [labels.firstMessage]);

  function fetchAnswer(question) {
    const id = uuidv4();

    dispatch({
      type: "add_message",
      payload: {
        id,
        variant: "chatbot",
        message: null,
        loading: true,
      },
    });
    ref.current.scrollTop = ref.current.scrollHeight;

    let answer = "";
    const history = state.chatHistory || [];
    const req = { question, markdown: true, history };

    const apiUrl = `wss://api.docsbot.ai/teams/${teamId}/bots/${botId}/chat`;
    const ws = new WebSocket(apiUrl);

    // Send message to server when connection is established
    ws.onopen = function (event) {
      ws.send(JSON.stringify(req));
    };

    ws.onerror = function (event) {
      console.error("error", event);
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
      const data = JSON.parse(event.data);
      if (data.sender === "bot") {
        if (data.type === "start") {
          ref.current.scrollTop = ref.current.scrollHeight;
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
          console.log(data.message);
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
            payload: { chatHistory: finalData.history },
          });
          ref.current.scrollTop = ref.current.scrollHeight;
          ws.close();
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
    return await remark()
      .use(html)
      .use(remarkGfm)
      .process(text)
      .then((html) => {
        return html.toString();
      });
  }

  return (
    <div
      className={clsx(
        alignment === "left" ? "docsbot-left" : "",
        "docsbot-wrapper"
      )}
    >
      <div className="docsbot-chat-container">
        <div className="docsbot-chat-inner-container">
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
          <div
            className="docsbot-chat-header"
            style={{
              backgroundColor: color,
              color: decideTextColor(color || "#1292EE"),
            }}
          >
            <div>
              <div className="docsbot-chat-header-content">
                <h1>{botName}</h1>
                <span>{description}</span>
              </div>
              <div className="docsbot-chat-header-background-wrapper">
                <div
                  className="docsbot-chat-header-background"
                  style={{
                    backgroundColor: color,
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
                <>
                  <BotChatMessage key={key} payload={message} />
                  {message?.options ? (
                    <Options key={key + "opts"} options={message.options} />
                  ) : null}
                </>
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
                      color: decideTextColor(getLighterColor(color || "#1292EE", 0.93)),
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
                        onClick={() => {
                          dispatch({
                            type: "add_message",
                            payload: {
                              variant: "user",
                              message: question,
                              loading: false,
                            },
                          });
                          fetchAnswer(question);
                          setChatInput("");
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
            <form
              className="docsbot-chat-input-form"
              onSubmit={(e) => {
                e.preventDefault();

                dispatch({
                  type: "add_message",
                  payload: {
                    variant: "user",
                    message: chatInput,
                    loading: false,
                  },
                });
                fetchAnswer(chatInput);
                setChatInput("");
                inputRef.current.focus();
              }}
            >
              <input
                className="docsbot-chat-input"
                placeholder={labels.inputPlaceholder}
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);
                }}
                ref={inputRef}
                minLength={10}
                maxLength={200}
              />
              <button
                type="submit"
                className="docsbot-chat-btn-send"
                style={{
                  fill: color,
                }}
                disabled={chatInput.length < 10}
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
