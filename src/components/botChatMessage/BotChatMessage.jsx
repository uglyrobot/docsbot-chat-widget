import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Loader } from "../loader/Loader";
import {
  faChevronDown,
  faChevronUp,
  faBullhorn,
} from "@fortawesome/free-solid-svg-icons";
import {
  faThumbsDown as regularThumbsDown,
  faThumbsUp as regularThumbsUp,
} from "@fortawesome/free-regular-svg-icons";
import { useConfig } from "../configContext/ConfigContext";
import { BotAvatar } from "../botAvatar/BotAvatar";
import { Source } from "../source/Source";
import { getLighterColor, decideTextColor } from "../../utils/colors";
import { useChatbot } from "../chatbotContext/ChatbotContext";

export const BotChatMessage = ({ payload, messageBoxRef }) => {
  const [showSources, setShowSources] = useState(false);
  const [isFlagged, setIsFlagged] = useState(false);
  const [rating, setRating] = useState(payload.rating || 0);
  const {
    color,
    teamId,
    botId,
    signature,
    hideSources,
    labels,
    supportLink,
    supportCallback,
  } = useConfig();
  const { dispatch, state } = useChatbot();
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (signature) {
    headers.Authorization = `Bearer ${signature}`;
  }

  const runSupportCallback = (e, history) => {
    // post to api endpoint
    const apiUrl = `https://api.docsbot.ai/teams/${teamId}/bots/${botId}/support/${payload.answerId}`;

    fetch(apiUrl, {
      method: "PUT",
      headers,
    }).catch((e) => {
      console.warn(`DOCSBOT: Error recording support click: ${e}`);
    });

    // run callback if provided
    if (supportCallback && typeof supportCallback === "function") {
      supportCallback(e, history);
    }

    return true; // ensure link is opened
  };

  // make api call to rate
  const saveRating = async (newRating = 0) => {
    setRating(newRating);

    const data = { rating: newRating };

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
          ref={messageBoxRef}
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
                      {!hideSources && payload.sources.length ? (
                        <button onClick={() => setShowSources(!showSources)}>
                          {labels.sources}
                          {showSources ? (
                            <FontAwesomeIcon icon={faChevronUp} />
                          ) : (
                            <FontAwesomeIcon icon={faChevronDown} />
                          )}
                        </button>
                      ) : null}
                      <div className="docbot-chat-bot-message-rate">
                        <button
                          onClick={(e) => {
                            saveRating(1);
                          }}
                          style={{ opacity: rating === 1 ? 1 : null }}
                          title={labels.helpful}
                        >
                          <FontAwesomeIcon
                            icon={regularThumbsUp}
                            size="sm"
                            style={{ color: rating === 1 ? "#037103" : null }}
                          />
                        </button>
                        <button
                          onClick={(e) => {
                            saveRating(-1);
                          }}
                          style={{ opacity: rating === -1 ? 1 : null }}
                          title={labels.unhelpful}
                        >
                          <FontAwesomeIcon
                            icon={regularThumbsDown}
                            size="sm"
                            style={{ color: rating === -1 ? "#cc0000" : null }}
                          />
                        </button>
                      </div>
                    </div>
                    {showSources && payload.sources.length ? (
                      <ul className="docsbot-sources">
                        {payload.sources?.map((source, index) => {
                          if (source?.type?.toLowerCase() !== "qa") {
                            return <Source key={index} source={source} />;
                          }
                        })}
                      </ul>
                    ) : null}
                  </>
                )}
              </>
            );
          })()}
        </div>
      </div>
      {payload.isLast && supportLink && (payload.sources || payload.error) && (
        <div className="docsbot-chat-bot-message-support">
          <a
            href={supportLink}
            target="_blank"
            onClick={(e) => runSupportCallback(e, state.chatHistory || [])}
            style={{
              color: decideTextColor(getLighterColor(color || "#1292EE", 0.93)),
            }}
          >
            {labels.getSupport}
            <FontAwesomeIcon
              icon={faBullhorn}
              style={{
                color: decideTextColor(
                  getLighterColor(color || "#1292EE", 0.93)
                ),
                marginLeft: 5,
              }}
            />
          </a>
        </div>
      )}
    </>
  );
};
