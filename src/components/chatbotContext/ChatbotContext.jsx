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
      const id = action.payload.id || uuidv4();
      return {
        ...state,
        messages: {
          ...state.messages,
          [id]: {
            id,
            variant: action.payload.variant,
            message: action.payload.message,
            loading: action.payload.loading || false,
            options: action.payload.options || [],
            ...action.payload,
          },
        },
      };
    case "update_message":
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.payload.id]: {
            ...state.messages[action.payload.id],
            ...action.payload,
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
