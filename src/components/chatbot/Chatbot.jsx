import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { remark } from "remark";
import html from "remark-html";
import remarkGfm from "remark-gfm";

import { useChatbot } from "../chatbotContext/ChatbotContext";
import { useConfig } from "../configContext/ConfigContext";
import { BotChatMessage } from "../botChatMessage/BotChatMessage";
import { UserChatMessage } from "../userChatMessage/UserChatMessage";
import { SendIcon } from "../icons/SendIcon";

export const Chatbot = ({ initialMessages }) => {
  const { dispatch, state } = useChatbot();
  const { teamId, botId } = useConfig();

  useEffect(() => {
    initialMessages.forEach((message) => {
      dispatch({
        type: "add_message",
        payload: { variant: "chatbot", message },
      });
    });
  }, [initialMessages]);

  const [answerHtml, setAnswerHtml] = useState("");
  const [error, setError] = useState();
  const [showSources, setShowSources] = useState(false);

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

  //convert markdown to html when answer changes or is appended to
  // useEffect(() => {
  //   if (apiResults?.answer) {
  //     remark()
  //       .use(html)
  //       .use(remarkGfm)
  //       .process(apiResults?.answer)
  //       .then((html) => {
  //         setAnswerHtml(html.toString());
  //       });
  //   }
  // }, [apiResults, setAnswerHtml]);

  const Source = ({ source }) => {
    const icon = source.url ? faLink : faFile;
    const page = source.page ? ` - Page ${source.page}` : "";

    return (
      <li>
        <FontAwesomeIcon icon={icon} a />
        {source.url ? (
          <a href={source.url} target="_blank" rel="noopener norefferer">
            {source.title}
            {page}
          </a>
        ) : (
          <span>
            {source.title || source.url}
            {page}
          </span>
        )}
      </li>
    );
  };

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
                    <BotChatMessage
                      key={key}
                      loading={message.loading}
                      message={message.message}
                    />
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
