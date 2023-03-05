import React from "react";

export const ActionProvider = ({
  createChatBotMessage,
  setState,
  children,
}) => {
  const handleFetchData = (message) => {
    console.log(`pass ${message} to api here!`);
    fetch(`https://jsonplaceholder.typicode.com/todos/1`)
      .then((response) => response.json())
      .then((json) => {
        const message = createChatBotMessage(json.title, {
          loading: true,
          terminateLoading: true,
        });
        updateChatbotState(message);
      });
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
