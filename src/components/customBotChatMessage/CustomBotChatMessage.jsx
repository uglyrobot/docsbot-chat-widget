export const CustomBotChatMessage = ({ message }) => {
  return (
    <div
      className="react-chatbot-kit-chat-bot-message"
      style={{
        backgroundColor: "rgb(8, 145, 178)",
        display: !message ? "none" : "block",
      }}
    >
      <span>{message}</span>
      <div
        className="react-chatbot-kit-chat-bot-message-arrow"
        style={{ borderRightColor: "rgb(8, 145, 178)" }}
      ></div>
    </div>
  );
};
