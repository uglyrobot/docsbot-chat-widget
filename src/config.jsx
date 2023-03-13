import { v4 as uuidv4 } from "uuid";
import { LinkList } from "./components/linkList/LinkList";

export const chatbotConfig = ({ dispatch }) => {
  return {
    initialMessages: [
      {
        message: "What can I help you with?",
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
            text: "Give me a random fact",
            handler: () => {
              dispatch({
                type: "add_message",
                payload: {
                  variant: "chatbot",
                  message:
                    "The United Nations estimates that there are over three million shipwrecks on the ocean floors. Lost, destroyed, or deliberately sunk, these wrecks are of interest to divers, underwater archaeologists, and treasure hunters alike.",
                  loading: false,
                },
              });
            },
          },
        ],
      },
    ],
  };
};
