import { Loader } from "../loader/Loader";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const UserChatMessage = ({ loading, message }) => {

  return (
    <div className="docsbot-user-chat-message-container">
      <div className="docsbot-user-chat-message">
        {(() => {
          if (loading) {
            return <Loader />;
          }

          return <ReactMarkdown children={message} remarkPlugins={[remarkGfm]} />;
        })()}
      </div>
    </div>
  );
};
