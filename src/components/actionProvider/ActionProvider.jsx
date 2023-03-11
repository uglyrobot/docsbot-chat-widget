import React from "react";
import { useConfig } from "../configContext/ConfigContext";

export const ActionProvider = ({
  createChatBotMessage,
  setState,
  children,
}) => {
  const { teamId, botId } = useConfig();
  const handleFetchData = (message) => {
    console.log(`pass ${message} to api here`);
    console.log(`pass ${teamId} to api here`);

    fetch(`https://api.docsbot.ai/teams/${teamId}/bots/${botId}/ask`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question: message }),
    })
      .then((response) => response.json())
      .then((json) => {
        const message = createChatBotMessage(json.answer, {
          loading: true,
          terminateLoading: true,
          widget: "javascriptLinks",
        });
        updateChatbotState(message);
      })
      .catch((error) => {
        console.log(error);
      })
  };

  const handleRandomFact = () => {
    const greetingMessage = createChatBotMessage(
      "The United Nations estimates that there are over three million shipwrecks on the ocean floors. Lost, destroyed, or deliberately sunk, these wrecks are of interest to divers, underwater archaeologists, and treasure hunters alike."
    );

    updateChatbotState(greetingMessage);
  };

  const handleJavascriptList = () => {
    const message = createChatBotMessage(
      "Fantastic, I've got the following resources for you for DocsBot AI:",
      {
        widget: "javascriptLinks",
      }
    );

    updateChatbotState(message);
  };

  const updateChatbotState = (message) => {
    console.log("%cmessage", "color:cyan; ", message);
    setState((prevState) => {
      console.log("%cprevState", "color:cyan; ", prevState);
      return {
        ...prevState,
        messages: [...prevState.messages, message],
      };
    });
  };

  // Pass functions in the actions object to pass to the MessageParser
  return (
    <div>
      {React.Children.map(children, (child) => {
        return React.cloneElement(child, {
          actions: {
            handleFetchData,
            handleRandomFact,
            handleJavascriptList,
          },
        });
      })}
    </div>
  );
};
