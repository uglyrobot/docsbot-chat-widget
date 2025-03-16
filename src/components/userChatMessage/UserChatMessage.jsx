import { Loader } from "../loader/Loader";
import { useConfig } from '../configContext/ConfigContext';
import { decideTextColor } from '../../utils/colors';

export const UserChatMessage = ({ loading, message }) => {
  const { color } = useConfig();
  const bgColor = color || '#1292EE';
  const textColor = decideTextColor(bgColor);

  return (
    <div className="docsbot-user-chat-message-container">
      <div className="docsbot-user-chat-message" style={{ backgroundColor: bgColor, color: textColor }}>
        {(() => {
          if (loading) {
            return <Loader />;
          }

          return <span>{message}</span>;
        })()}
      </div>
    </div>
  );
};
