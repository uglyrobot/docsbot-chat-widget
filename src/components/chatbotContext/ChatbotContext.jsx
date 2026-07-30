import React from "react"
import { v4 as uuidv4 } from "uuid"
import {
  mergeVoiceLookupSourcesIntoMessages,
  upsertVoiceTranscriptHistory,
  upsertVoiceTranscriptMessageMap,
} from "../../utils/voiceCallHistory.mjs"

const ChatbotContext = React.createContext()

function chatbotReducer(state, action) {
  switch (action.type) {
    case "save_history":
      return {
        ...state,
        chatHistory: action.payload.chatHistory,
        voiceHistoryItemIndices: {},
      }
    case "start_voice_history":
      return {
        ...state,
        voiceHistoryItemIndices: {},
      }
    case "merge_voice_lookup_sources":
      return {
        ...state,
        messages: mergeVoiceLookupSourcesIntoMessages(state.messages),
      }
    case "upsert_voice_history": {
      const nextVoiceHistory = upsertVoiceTranscriptHistory(
        state.chatHistory,
        state.voiceHistoryItemIndices,
        action.payload,
        action.payload?.transcriptOrder
      )
      return {
        ...state,
        chatHistory: nextVoiceHistory.history,
        voiceHistoryItemIndices: nextVoiceHistory.itemIndices,
      }
    }
    case "upsert_voice_message": {
      const messageId = action.payload?.id || uuidv4()
      const {
        transcriptOrder,
        ...messageFields
      } = action.payload || {}
      const payload = {
        id: messageId,
        variant: messageFields.variant,
        message: messageFields.message,
        loading: messageFields.loading || false,
        options: messageFields.options || [],
        ...messageFields,
        id: messageId,
      }
      return {
        ...state,
        lastMessage: messageFields.timestamp || Date.now(),
        messages: upsertVoiceTranscriptMessageMap(state.messages, {
          messageId,
          payload,
          itemId: messageFields.realtimeItemId,
          transcriptOrder,
        }),
      }
    }
    case "add_message":
      const id = action.payload.id || uuidv4()
      return {
        ...state,
        lastMessage: action.payload.timestamp || Date.now(),
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
      }
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
      }
    case "remove_message": {
      const nextMessages = { ...state.messages };
      delete nextMessages[action.payload.id];
      return {
        ...state,
        messages: nextMessages
      };
    }
    case "load_conversation":
      return {
        messages: action.payload.savedConversation || [],
        voiceHistoryItemIndices: {},
      }
    case "clear_messages":
      return {
        messages: [],
        chatHistory: [],
        voiceHistoryItemIndices: {},
      }

    default: {
      throw new Error(`Unhandled action type: ${action.type}`)
    }
  }
}

export function ChatbotProvider({ children }) {
  const [state, dispatch] = React.useReducer(chatbotReducer, {
    messages: [],
    suggestions: [],
    chatInput: "",
    chatHistory: [],
    voiceHistoryItemIndices: {},
    lastMessage: Date.now(),
  })
  const value = { state, dispatch }
  return <ChatbotContext.Provider value={value}>{children}</ChatbotContext.Provider>
}

export function useChatbot() {
  const context = React.useContext(ChatbotContext)
  if (context === undefined) {
    throw new Error("useChatbot must be used within a ChatbotProvider")
  }
  return context
}
