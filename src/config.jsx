import { createChatBotMessage } from "react-chatbot-kit";
import { InitialOptions } from "./components/initialOptions/InitialOptions";
import { LinkList } from "./components/linkList/LinkList";
import { ThemeColors } from "./constants/theme";


export const config = () => {
  return {
    botName: "DocsBot",
    initialMessages: [
      createChatBotMessage(`What can I help you with?`, {
        widget: "initialOptions",
      }),
    ],
    customStyles: {
      botMessageBox: {
        backgroundColor: ThemeColors.TEAL,
      },
      chatButton: {
        backgroundColor: ThemeColors.TEAL,
      },
    },
    widgets: [
      {
        widgetName: "initialOptions",
        widgetFunc: (props) => <InitialOptions {...props} />,
      },
      {
        widgetName: "javascriptLinks",
        widgetFunc: (props) => <LinkList {...props} />,
        props: {
          options: [
            {
              text: "DocsBot AI Documentation",
              url: "https://docsbot.ai/#features",
              id: 1,
            },
          ],
        },
      },
    ],
    // customComponents: {
    //   // Replaces the default header
    //   header: () => (
    //     <div
    //       style={{ backgroundColor: "red", padding: "5px", borderRadius: "3px" }}
    //     >
    //       This is the header
    //     </div>
    //   ),
    //   // Replaces the default bot avatar
    //   botAvatar: (props) => <MyAvatar {...props} />,
    //   // Replaces the default bot chat message container
    //   botChatMessage: (props) => <MyCustomChatMessage {...props} />,
    //   // Replaces the default user icon
    //   userAvatar: (props) => <MyCustomAvatar {...props} />,
    //   // Replaces the default user chat message
    //   userChatMessage: (props) => <MyCustomUserChatMessage {...props} />,
    // },
  };
};
