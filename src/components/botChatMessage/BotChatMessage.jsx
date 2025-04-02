import { useState, useEffect, useRef } from "react";
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
import { getHighlightJs } from '../../utils/highlightjs';

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
  const contentRef = useRef(null);
  const [hljs, setHljs] = useState(null);

  useEffect(() => {
    getHighlightJs().then(setHljs);
  }, []);

  useEffect(() => {
    if (contentRef.current && hljs) {
      const codeBlocks = contentRef.current.querySelectorAll('pre code');
      codeBlocks.forEach((block) => {
        hljs.highlightElement(block);
      });
    }
  }, [payload.message, hljs]);

  const runSupportCallback = (e, history) => {
    // Store the original URL we want to navigate to
    const targetUrl = e && e.target && e.target.href;

    // Prevent default to ensure we complete the request before navigation
    if (e && e.preventDefault) {
      e.preventDefault();
    }

    // post to api endpoint
    const apiUrl = `https://api.docsbot.ai/teams/${teamId}/bots/${botId}/support/${payload.answerId}`;

    // Return a promise to ensure the request completes
    return fetch(apiUrl, {
      method: "PUT",
      headers,
    })
      .catch((err) => {
        console.warn(`DOCSBOT: Error recording support click: ${err}`);
      })
      .finally(() => {
        // Create a flag to track if we should open the link
        let shouldOpenLink = true;

        // run callback if provided
        if (supportCallback && typeof supportCallback === "function") {
          // Create a synthetic event with its own preventDefault method
          const syntheticEvent = e ? { ...e } : {};
          syntheticEvent.preventDefault = () => {
            shouldOpenLink = false;
          };

          supportCallback(syntheticEvent, history);
        }

        // Open the link if it exists and shouldOpenLink is still true
        if (shouldOpenLink && targetUrl && targetUrl !== '#') {
          window.open(targetUrl, "_blank");
        }
      });
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

  return (
    <>
      <div className="docsbot-chat-bot-message-container">
        <BotAvatar />
        <div
          className="docsbot-chat-bot-message"
		  {...(payload.error && {style: {backgroundColor: '#FEFCE8', color: '#713F12'}})}
          ref={messageBoxRef}
        >
          {(() => {
            if (payload.loading) {
              return <Loader />;
            }

            return (
              <>
                <span
                  ref={contentRef}
                  dangerouslySetInnerHTML={{ __html: payload.message }}
                />
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
                            size="lg"
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
                            size="lg"
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
