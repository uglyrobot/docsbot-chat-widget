import { Loader } from "../loader/Loader";

export const UserChatMessage = ({ loading, message, imageUrls, messageBoxRef }) => {
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
          if (loading) {
            return <Loader />;
          }

          return <span dir="auto">{message}</span>;
        })()}
      </div>
    </div>
  );
};
