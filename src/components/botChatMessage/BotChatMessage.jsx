import { useState, useEffect, useRef } from "react";
import { Loader } from "../loader/Loader";
import { useConfig } from "../configContext/ConfigContext";
import { BotAvatar } from "../botAvatar/BotAvatar";
import { Source } from "../source/Source";
import { useChatbot } from "../chatbotContext/ChatbotContext";
import { getHighlightJs } from '../../utils/highlightjs';
import clsx from 'clsx';

export const BotChatMessage = ({ payload, messageBoxRef }) => {
  const [isFlagged, setIsFlagged] = useState(false);
  const [rating, setRating] = useState(payload.rating || 0);
  const {
    teamId,
    botId,
	botIcon,
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

				{!hideSources && payload.sources?.length > 0 && (
					<div className="docsbot-sources-container">
						<h3 className="docsbot-sources-title">{labels.sources}</h3>

						<ul className="docsbot-sources">
							{payload.sources?.map((source, index) => {
								if (source?.type?.toLowerCase() !== "qa") {
									return <Source key={index} source={source} />;
								}
							})}
						</ul>
					</div>
				)}
              </>
            );
          })()}
        </div>
      </div>

	  {!payload.loading && payload.sources && (
			<>
				<div className={clsx(
					'docsbot-chat-bot-message-container',
					botIcon && 'has-avatar'
				)}>
					<div className="docsbot-chat-bot-message">Was it helpful?</div>
				</div>

				<div className={clsx(
					'docbot-chat-bot-message-rate',
					botIcon && 'has-avatar'
				)}>
                    <button
                        onClick={(e) => {
                            saveRating(1);
                        }}
                        title={labels.helpful}
						className={clsx(
							'doscbot-rate-good',
							rating === 1 && 'selected'
						)}
						{...(rating === 1 && {disabled: true})}
                    >
						<span aria-hidden="true">👍 Yes</span>
                    </button>

                    <button
                        onClick={(e) => {
                        	saveRating(-1);
                        }}
						title={labels.unhelpful}
                        className={clsx(
							'doscbot-rate-bad',
							rating === -1 && 'selected'
						)}
						{...(rating === -1 && {disabled: true})}
                    >
                        <span aria-hidden="true">👎 No</span>
                    </button>
                </div>
			</>
		)}

      {payload.isLast && supportLink && (payload.sources || payload.error) && (
		<div className={clsx(
			'docsbot-chat-bot-message-container',
			botIcon && 'has-avatar'
		)}>
			<div className="docsbot-chat-bot-message-support">
			<a
				href={supportLink}
				target="_blank"
				onClick={(e) => runSupportCallback(e, state.chatHistory || [])}
			>
				📢 {labels.getSupport}
			</a>
			</div>
		</div>
      )}
    </>
  );
};
