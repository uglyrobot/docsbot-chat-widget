import { Loader } from "../loader/Loader";
import { UserIcon } from "../icons/UserIcon";

export const UserChatMessage = ({ loading, message }) => {
  return (
    <div className="react-chatbot-kit-user-chat-message-container">
      <div className="react-chatbot-kit-user-chat-message">
        {(() => {
          if (loading) {
            return <Loader />;
          }

          return <span>{message}</span>;
        })()}
        <div className="react-chatbot-kit-user-chat-message-arrow"></div>
      </div>
      <div className="react-chatbot-kit-user-avatar">
        <div className="react-chatbot-kit-user-avatar-container">
          <UserIcon />
        </div>
      </div>
    </div>
  );
};
