import { Loader } from "../loader/Loader";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMicrophone } from "@fortawesome/free-solid-svg-icons";

export const UserChatMessage = ({ loading, message, imageUrls, audio, messageBoxRef }) => {
  return (
    <div className="docsbot-user-chat-message-container">
      {imageUrls && imageUrls.length > 0 && (
        <div className="docsbot-user-chat-images">
          {imageUrls.map((url, index) => (
            <div key={index} className="docsbot-user-chat-image-container">
              <img 
                src={url} 
                alt={`Attachment ${index + 1}`} 
                className="docsbot-user-chat-image"
              />
            </div>
          ))}
        </div>
      )}
      
      <div className="docsbot-user-chat-message" ref={messageBoxRef}>
        <span className="docsbot-screen-reader-only">You: </span>
        {(() => {
          if (loading && audio) {
            return (
              <span className="docsbot-user-audio-pending" aria-label={message}>
                <FontAwesomeIcon icon={faMicrophone} />
                <span className="docsbot-user-audio-wave" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            );
          }

          if (loading) {
            return <Loader />;
          }

          return <span dir="auto">{message}</span>;
        })()}
      </div>
    </div>
  );
};
