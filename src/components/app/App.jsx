import React, { useEffect, useState } from "react";
import ReactShadowRoot from "react-shadow-root";
import { FloatingButton } from "../floatingButton/FloatingButton";
import { config as fontAwesomeConfig } from "@fortawesome/fontawesome-svg-core";
import fontAwesomeStyles from "!raw-loader!@fortawesome/fontawesome-svg-core/styles.css";
import reactChatbotStyles from "!raw-loader!../../chatbot.css";
import appStyles from "!raw-loader!./App.css";
import floatingButtonStyles from "!raw-loader!../floatingButton/FloatingButton.css";
import initialOptionsStyles from "!raw-loader!../initialOptions/InitialOptions.css";
import messageWidgetStyles from "!raw-loader!../botMessage/BotMessage.css";
import linkListStyles from "!raw-loader!../linkList/LinkList.css";

import { chatbotConfig } from "../../config";
import { useConfig } from "../configContext/ConfigContext";
import { useChatbot } from "../chatbotContext/ChatbotContext";
import { ChatbotProvider } from "../chatbotContext/ChatbotContext";
import { BotChatMessage } from "../botChatMessage/BotChatMessage";

fontAwesomeConfig.autoAddCss = false;

function App({} = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [userConfig, setUserConfig] = useState({});
  const userConf = useConfig();

  useEffect(() => {
    //override the default config with the user's config, only if the user's config is not empty
    let customMessages = chatbotConfig.initialMessages;
    if (userConf.initialMessage) {
      customMessages = [];
    }

    setUserConfig((prevConfig) => ({
      ...prevConfig,
    }));
  }, []);

  return (
    <ReactShadowRoot>
      <style type="text/css">{fontAwesomeStyles}</style>
      <style type="text/css">{reactChatbotStyles}</style>
      <style type="text/css">{appStyles}</style>
      <style type="text/css">{floatingButtonStyles}</style>
      <style type="text/css">{initialOptionsStyles}</style>
      <style type="text/css">{linkListStyles}</style>
      <style type="text/css">{messageWidgetStyles}</style>

      <FloatingButton onClick={() => setIsOpen(!isOpen)} />
      {isOpen ? (
        <ChatbotProvider>
          <ReactChatbotCustom initialMessages={chatbotConfig.initialMessages} />
        </ChatbotProvider>
      ) : null}
    </ReactShadowRoot>
  );
}

export default App;

export const ReactChatbotCustom = ({ initialMessages }) => {
  const { dispatch, state } = useChatbot();
  console.log("%cstate", "color:cyan; ", state);
  useEffect(() => {
    initialMessages.forEach((message) => {
      dispatch({
        type: "add_message",
        payload: { variant: "chatbot", message },
      });
    });
  }, [initialMessages]);
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
                      loading={message.loading}
                      message={message.message}
                    />
                  ) : (
                    "User"
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
                        isLoading: false,
                      },
                    });

                    dispatch({
                      type: "clear_input",
                      payload: { chatInput: e.target.value },
                    });
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
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 512 512"
                      className="react-chatbot-kit-chat-btn-send-icon"
                    >
                      <path d="M476 3.2L12.5 270.6c-18.1 10.4-15.8 35.6 2.2 43.2L121 358.4l287.3-253.2c5.5-4.9 13.3 2.6 8.6 8.3L176 407v80.5c0 23.6 28.5 32.9 42.5 15.8L282 426l124.6 52.2c14.2 6 30.4-2.9 33-18.2l72-432C515 7.8 493.3-6.8 476 3.2z"></path>
                    </svg>
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

// <div className="initial-options-container">
//   <button className="initial-option-button">
//     Need help using Docsbot
//   </button>
//   <button className="initial-option-button">
//     Give me a random fact
//   </button>
// </div>
