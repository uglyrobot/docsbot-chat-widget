import { Loader } from "../loader/Loader";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMicrophone } from "@fortawesome/free-solid-svg-icons";
import clsx from "clsx";
import { readOpenUIActionMessage } from '../../utils/openuiActions.mjs';

export const UserChatMessage = ({ loading, message, imageUrls, audio, messageBoxRef, consecutive }) => {
  return (
    <div className={clsx(
      "docsbot-user-chat-message-container",
      consecutive && "consecutive-user-message"
    )}>
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

          const submission = readOpenUIActionMessage(message);
          if (submission?.entries.length) return <details dir="auto" className="docsbot-ui-submission">
            <summary>{submission.display}</summary>
            <dl style={{margin:'8px 0 0', fontSize:'inherit', overflowWrap:'anywhere'}}>{submission.entries.map(({label,value}) => <div key={label} style={{marginTop:6}}><dt style={{fontWeight:600}}>{label}</dt><dd style={{margin:0, whiteSpace:'pre-wrap'}}>{value}</dd></div>)}</dl>
          </details>;
          return <span dir="auto">{submission?.display || message}</span>;
        })()}
      </div>
    </div>
  );
};
