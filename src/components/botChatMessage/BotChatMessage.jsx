import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Loader } from "../loader/Loader";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import {
  faFaceGrin,
  faFaceFrownOpen,
} from "@fortawesome/free-regular-svg-icons";
import { useConfig } from "../configContext/ConfigContext";
import { BotAvatar } from "../botAvatar/BotAvatar";
import { Source } from "../source/Source";
import { getLighterColor, decideTextColor } from "../../utils/colors";
import { useChatbot } from "../chatbotContext/ChatbotContext";

export const BotChatMessage = ({ payload }) => {
  const [showSources, setShowSources] = useState(false);
  const [rating, setRating] = useState(payload.rating || 0);
  const { color, teamId, botId, labels, supportLink, supportCallback } = useConfig();
  const { dispatch, state } = useChatbot();

  // make api call to rate
  const saveRating = async (newRating = 0) => {
    setRating(newRating);

    const data = { rating: newRating };

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    const apiUrl = `https://api.docsbot.ai/teams/${teamId}/bots/${botId}/rate/${payload.answerId}`;
    try {
      const response = await fetch(apiUrl, {
        method: "PUT",
        headers,
        body: JSON.stringify(data),
      });
      if (response.ok) {
        dispatch({
          type: "update_message",
          payload: {
            id: payload.id,
            rating: newRating,
          },
        });
      } else {
        setRating(0);
        try {
          const data = await response.json();
          if (data.error) {
            console.warn(
              data.error || "Something went wrong, please try again."
            );
          }
        } catch (e) {
          console.warn(e);
        }
      }
    } catch (e) {
      console.warn(e);
      setRating(0);
    }
  };

  const bgColor = payload.error
    ? "#FEFCE8"
    : getLighterColor(color || "#1292EE");
  const fontColor = payload.error ? "#713F12" : decideTextColor(bgColor);
  return (
    <>
      <div className="docsbot-chat-bot-message-container">
        <BotAvatar />
        <div
          className="docsbot-chat-bot-message"
          style={{
            backgroundColor: bgColor,
            color: fontColor,
          }}
        >
          {(() => {
            if (payload.loading) {
              return <Loader />;
            }

            return (
              <>
                <span dangerouslySetInnerHTML={{ __html: payload.message }} />
                {payload.sources && (
                  <>
                    <div className="docsbot-chat-bot-message-meta">
                      <button onClick={() => setShowSources(!showSources)}>
                        {labels.sources}
                        {showSources ? (
                          <FontAwesomeIcon icon={faChevronUp} />
                        ) : (
                          <FontAwesomeIcon icon={faChevronDown} />
                        )}
                      </button>
                      <div className="docbot-chat-bot-message-rate">
                        <button
                          onClick={(e) => saveRating(-1)}
                          style={{ opacity: rating === -1 ? 1 : null }}
                          title={labels.unhelpful}
                        >
                          <FontAwesomeIcon icon={faFaceFrownOpen} />
                        </button>
                        <button
                          onClick={(e) => saveRating(1)}
                          style={{ opacity: rating === 1 ? 1 : null }}
                          title={labels.helpful}
                        >
                          <FontAwesomeIcon icon={faFaceGrin} />
                        </button>
                      </div>
                    </div>
                    {showSources && (
                      <ul className="docsbot-sources">
                        {payload.sources?.map((source, index) => (
                          <Source key={index} source={source} />
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </>
            );
          })()}
        </div>
      </div>
      {payload.isLast && supportLink && ( payload.sources || payload.error ) && (
        <div className="docsbot-chat-bot-message-support">
          <a
            href={supportLink}
            onClick={(e) => supportCallback(e, state.chatHistory || [])}
            style={{
              backgroundColor: getLighterColor(color || "#1292EE", 0.93),
              color: decideTextColor(getLighterColor(color || "#1292EE", 0.93)),
            }}
          >
            {labels.getSupport}
          </a>
        </div>
      )}
    </>
  );
};
