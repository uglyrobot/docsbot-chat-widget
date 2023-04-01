import { v4 as uuidv4 } from "uuid";
import { LinkList } from "./components/linkList/LinkList";

export const chatbotConfig = ({ dispatch }) => {
  return {
    initialMessages: [
      {
        message: "What can I help you with?",
        /*
        options: [
          {
            id: uuidv4(),
            text: "Need help using Docsbot",
            handler: () => {
              dispatch({
                type: "add_message",
                payload: {
                  variant: "chatbot",
                  message:
                    "Fantastic, I've got the following resources for you for DocsBot AI:",
                  widget: (
                    <LinkList
                      options={[
                        {
                          text: "DocsBot AI Documentation",
                          url: "https://docsbot.ai/#features",
                          id: 1,
                        },
                      ]}
                    />
                  ),
                  loading: false,
                },
              });
            },
          },
          {
            id: uuidv4(),
            text: "What is DocsBot AI?",
            handler: () => {
              dispatch({
                type: "add_message",
                payload: {
                  variant: "user",
                  message:
                    "What is DocsBot AI?",
                  loading: false,
                },
              });
            },
          },
          {
            id: uuidv4(),
            text: "List your features.",
            handler: () => {
              dispatch({
                type: "add_message",
                payload: {
                  variant: "user",
                  message:
                    "List your features.",
                  loading: false,
                },
              });
            },
          },
        ],
        */
      },
    ],
  };
};
