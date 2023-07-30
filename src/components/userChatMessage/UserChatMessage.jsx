import { Loader } from "../loader/Loader";

export const UserChatMessage = ({ loading, message }) => {

  return (
    <div className="docsbot-user-chat-message-container">
      <div className="docsbot-user-chat-message">
        {(() => {
          if (loading) {
            return <Loader />;
          }

          return <span dangerouslySetInnerHTML={{ __html: message }} />;
        })()}
      </div>
    </div>
  );
};
