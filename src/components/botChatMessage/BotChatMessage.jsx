import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/free-solid-svg-icons";
import { Loader } from "../loader/Loader";

export const BotChatMessage = ({ loading, message }) => {
  return (
    <div className="react-chatbot-kit-chat-bot-message-container">
      <div className="react-chatbot-kit-chat-bot-avatar">
        <div className="react-chatbot-kit-chat-bot-avatar-container">
          <p className="react-chatbot-kit-chat-bot-avatar-letter">
            <FontAwesomeIcon icon={faRobot} />
          </p>
        </div>
      </div>
      <div
        className="react-chatbot-kit-chat-bot-message"
        style={{ backgroundColor: "rgb(8, 145, 178)" }}
      >
        {(() => {
          if (loading) {
            return <Loader />;
          }

          return <span dangerouslySetInnerHTML={{ __html: message }} />;
        })()}
        <div
          className="react-chatbot-kit-chat-bot-message-arrow"
          style={{ borderRightColor: "rgb(8, 145, 178)" }}
        ></div>
      </div>
    </div>
  );
};
