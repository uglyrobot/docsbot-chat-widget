import React from "react";
import { v4 as uuidv4 } from "uuid";

const ChatbotContext = React.createContext();

function chatbotReducer(state, action) {
  switch (action.type) {
    case "update_input":
      return {
        ...state,
        chatInput: action.payload.chatInput,
      };
    case "clear_input":
      return {
        ...state,
        chatInput: "",
      };
    case "add_message":
      const id = uuidv4();
      return {
        ...state,
        messages: {
          ...state.messages,
          [id]: {
            id,
            variant: action.payload.variant,
            message: action.payload.message,
            isLoading: action.payload.isLoading || false,
          },
        },
      };

    default: {
      throw new Error(`Unhandled action type: ${action.type}`);
    }
  }
}

export function ChatbotProvider({ children }) {
  const [state, dispatch] = React.useReducer(chatbotReducer, {
    messages: [],
    chatInput: "",
  });
  const value = { state, dispatch };
  return (
    <ChatbotContext.Provider value={value}>{children}</ChatbotContext.Provider>
  );
}

export function useChatbot() {
  const context = React.useContext(ChatbotContext);
  if (context === undefined) {
    throw new Error("useChatbot must be used within a ChatbotProvider");
  }
  return context;
}
