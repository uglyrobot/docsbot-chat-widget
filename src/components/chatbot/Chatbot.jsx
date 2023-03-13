import { useEffect, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { remark } from "remark";
import html from "remark-html";
import remarkGfm from "remark-gfm";

import { useChatbot } from "../chatbotContext/ChatbotContext";
import { useConfig } from "../configContext/ConfigContext";
import { BotChatMessage } from "../botChatMessage/BotChatMessage";
import { UserChatMessage } from "../userChatMessage/UserChatMessage";
import { SendIcon } from "../icons/SendIcon";
import { Source } from "../source/Source";
import { Options } from "../options/Options";
import { chatbotConfig } from "../../config";

export const Chatbot = () => {
  const { dispatch, state } = useChatbot();
  const { teamId, botId } = useConfig();

  const config = useMemo(() => {
    return chatbotConfig({ dispatch });
  }, [dispatch]);

  useEffect(() => {
    config.initialMessages.forEach((message) => {
      dispatch({
        type: "add_message",
        payload: {
          variant: "chatbot",
          options: message.options,
          message: message.message,
        },
      });
    });
  }, [config.initialMessages]);

  function fetchDocsBot() {
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

    fetch(`https://api.docsbot.ai/teams/${teamId}/bots/${botId}/ask`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question: state.chatInput }),
    })
      .then((response) => {
        if (response.status >= 200 && response.status < 300) {
          return Promise.resolve(response);
        } else {
          return Promise.reject(new Error(response));
        }
      })
      .then((response) => response.json())
      .then((json) => {
        remark()
          .use(html)
          .use(remarkGfm)
          .process(json?.answer)
          .then((parsedHtml) => {
            dispatch({
              type: "update_message",
              payload: {
                id,
                variant: "chatbot",
                message: parsedHtml,
                sources: json?.sources,
                loading: false,
              },
            });
          });
      })
      .catch((_) => {
        dispatch({
          type: "update_message",
          payload: {
            id,
            variant: "chatbot",
            message:
              "I'm sorry, I don't understand what you're asking. Can you please provide more context or a specific question related to Infinite Uploads?",
            loading: false,
          },
        });
      });
  }

  return (
    <div className="react-chatbot-kit-wrapper">
      <div>
        <div>
          <div className="react-chatbot-kit-chat-container">
            <div className="react-chatbot-kit-chat-inner-container">
              <div className="react-chatbot-kit-chat-header">
                Conversation with Infinite Uploads
              </div>
              <div className="react-chatbot-kit-chat-message-container">
                {Object.keys(state.messages).map((key) => {
                  const message = state.messages[key];

                  return message.variant === "chatbot" ? (
                    <>
                      <BotChatMessage
                        key={key}
                        loading={message.loading}
                        message={message.message}
                      />
                      {message?.options ? (
                        <Options options={message.options} />
                      ) : null}
                      {message?.sources?.map((source) => (
                        <ul>
                          <Source key={source.url} source={source} />
                        </ul>
                      ))}
                      {message?.widget}
                    </>
                  ) : (
                    <UserChatMessage
                      key={key}
                      loading={message.loading}
                      message={message.message}
                    />
                  );
                })}
              </div>
              <div className="react-chatbot-kit-chat-input-container">
                <form
                  className="react-chatbot-kit-chat-input-form"
                  onSubmit={(e) => {
                    e.preventDefault();

                    dispatch({
                      type: "add_message",
                      payload: {
                        variant: "user",
                        message: state.chatInput,
                        loading: false,
                      },
                    });

                    dispatch({
                      type: "clear_input",
                      payload: { chatInput: e.target.value },
                    });

                    fetchDocsBot();
                  }}
                >
                  <input
                    className="react-chatbot-kit-chat-input"
                    placeholder="Write your message here"
                    value={state.chatInput}
                    onChange={(e) => {
                      dispatch({
                        type: "update_input",
                        payload: { chatInput: e.target.value },
                      });
                    }}
                  />
                  <button
                    type="submit"
                    className="react-chatbot-kit-chat-btn-send"
                    style={{ backgroundColor: "rgb(8, 145, 178)" }}
                  >
                    <SendIcon />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
