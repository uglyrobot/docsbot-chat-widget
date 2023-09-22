import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Loader } from "../loader/Loader";
import { faChevronDown, faChevronUp, faFlag as solidFlag, faBullhorn, faXmark, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { faFlag as regularFlag, } from "@fortawesome/free-regular-svg-icons";
import { useConfig } from "../configContext/ConfigContext";
import { BotAvatar } from "../botAvatar/BotAvatar";
import { Source } from "../source/Source";
import { getLighterColor, decideTextColor } from "../../utils/colors";
import { useChatbot } from "../chatbotContext/ChatbotContext";
import botMessageStyles from "!raw-loader!./botMessage.css";

export const BotChatMessage = ({ payload, showSupportMessage, setShowSupportMessage, fetchAnswer, showFeedbackButton, setShowFeedbackButton, showHumanButton, setShowHumanButton }) => {
  const [showSources, setShowSources] = useState(false);
  const [isFlagged, setIsFlagged] = useState(false)
  const [rating, setRating] = useState(payload.rating || 0);
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [isShowSaved, setIsShowSaved] = useState(false)
  const [isShowEmail, setIsShowEmail] = useState(false)
  const [isShowEmailError, setIsShowEmailError] = useState(false)
  const [showHumanSupportButton, setShowHumanSupportButton] = useState(false)
  const { color, teamId, botId, signature, hideSources, labels, supportLink, supportCallback, identify } = useConfig();
  const { dispatch, state } = useChatbot();
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (signature) {
    headers.Authorization = `Bearer ${signature}`;
  }

  useEffect(() => {
    if (showHumanButton) {
      const supportButtonTimeout = setTimeout(() => {
        setShowHumanSupportButton(true)
      }, 1000)
      return () => {
        clearTimeout(supportButtonTimeout)
      }
    }
  }, [showHumanButton])

  const runSupportCallback = (e, history) => {
    // post to api endpoint
    const apiUrl = `https://api.docsbot.ai/teams/${teamId}/bots/${botId}/conversations/${payload.answerId}/escalate`;

    fetch(apiUrl, {
      method: "PUT",
      headers,
    }).catch((e) => {
      console.warn(`DOCSBOT: Error recording support click: ${e}`);
    });

    // run callback if provided
    if (supportCallback && typeof supportCallback === "function") {
      supportCallback(e, history)
    }

    return true // ensure link is opened
  }

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

  const handleContact = () => {
    const isValidEmail = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(email);
    if (email.trim().length > 0 && isValidEmail) {
      setIsShowEmailError(false)
      const userData = {
        name: name,
        email: email
      }
      let metadata = identify;
      metadata = {
        ...metadata,
        ...userData
      }
      const apiUrl = `https://api.docsbot.ai/teams/${teamId}/bots/${botId}/conversations/${payload.id}`;
      const contactPayload = {
        metadata: metadata,
        fullChange: false
      }
      fetch(apiUrl, {
        method: "PUT",
        headers,
        body: JSON.stringify(contactPayload)
      })
        .catch((e) => {
          console.warn(`DOCSBOT: Error recording support click: ${e}`);
        });

      localStorage.setItem('userContactDetails', JSON.stringify(userData))
      setShowSupportMessage(false)
      setIsShowSaved(true)
    }
    else {
      setIsShowEmailError(true)
    }
  }

  const handleFeedbackButton = (message, isFeedback) => {
    setShowSupportMessage(false)
    dispatch({
      type: "add_message",
      payload: {
        variant: "user",
        message: message,
        loading: false,
        timestamp: Date.now(),
      },
    });
    setShowFeedbackButton(false)
    setShowHumanButton(false)
    setShowHumanSupportButton(false)
    fetchAnswer(message, isFeedback);
  }

  const bgColor = payload.error
    ? "#FEFCE8"
    : getLighterColor(color || "#1292EE");
  const fontColor = payload.error ? "#713F12" : decideTextColor(bgColor);
  return (
    <>
      <style type="text/css">{botMessageStyles}</style>
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
                {payload.sources?.length && (
                  <>
                    <div className="docsbot-chat-bot-message-meta">
                      {payload.options?.hideSources}
                      {!hideSources && (
                        <button onClick={() => setShowSources(!showSources)}>
                          {labels.sources}
                          {showSources ? (
                            <FontAwesomeIcon icon={faChevronUp} />
                          ) : (
                            <FontAwesomeIcon icon={faChevronDown} />
                          )}
                        </button>
                      )}
                      <div className="docbot-chat-bot-message-rate">
                        <button
                          onClick={(e) => {
                            if (isFlagged)
                              saveRating(0)
                            else
                              saveRating(-1)

                            setIsFlagged(!isFlagged)
                          }}
                          style={{ opacity: rating === -1 ? 1 : null }}
                          title={labels.unhelpful}
                        >
                          {
                            isFlagged ? (
                              <FontAwesomeIcon icon={solidFlag} size="sm" style={{ color: '#ff0000' }} />
                            ) : (
                              <FontAwesomeIcon icon={regularFlag} size="sm" />
                            )
                          }

                        </button>
                      </div>
                    </div>
                    {showSources && (
                      <ul className="docsbot-sources">
                        {payload.sources?.map((source, index) => {
                          if (source?.type?.toLowerCase() !== 'qa') {
                            return <Source key={index} source={source} />
                          }
                        })}
                      </ul>
                    )}
                  </>
                )}
              </>
            );
          })()}
        </div>
      </div>
      {
        showSupportMessage && payload?.isLast && !payload?.isFirstMessage ? <div className="docsbot-chat-bot-message-container support-box-container">
          <div className="docsbot-chat-bot-message chat-support-message-box">
            <div className="contact-header-container">
              <p>Let us know how to contact you?</p>
              <button><FontAwesomeIcon size="xl" icon={faXmark} onClick={() => {
                setShowSupportMessage(false)
                localStorage.setItem('hideSupportMessage', 'true')
              }} /></button>
            </div>
            <div className="support-box-form-container">
              {
                !isShowEmail ?
                  <>
                    <div>
                      <input type="text" placeholder="Enter you name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <button onClick={() => setIsShowEmail(true)} ><FontAwesomeIcon icon={faChevronRight} size='lg' /></button>
                  </>
                  : null
              }
              {
                isShowEmail ?
                  <>
                    <div>
                      <input type="email" required placeholder="Enter you email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <button onClick={handleContact}><FontAwesomeIcon icon={faChevronRight} size='lg' /></button>
                  </>
                  : null
              }
            </div>
            {
              isShowEmailError ? <p className="errorText">Please enter a valid email address</p> : null
            }
          </div>
        </div>
          : null
      }
      {
        isShowSaved ?
          <div className="docsbot-chat-bot-message-container support-box-container">
            <div className="docsbot-chat-bot-message"
              style={{
                backgroundColor: bgColor,
                color: fontColor,
                width: '100%'
              }}>
              <div className="contact-header-container">
                <p>Your details has been saved successfully!</p>
                <button><FontAwesomeIcon size="xl" icon={faXmark} onClick={() => setIsShowSaved(false)} /></button>
              </div>
            </div>
          </div>
          : null
      }
      {
        showFeedbackButton && !showHumanButton && !payload?.isFeedback && payload?.isLast && !payload?.isFirstMessage ?
          <div className="docsbot-chat-bot-message-container support-box-container">
            <div className="docsbot-chat-bot-message"
              style={{
                backgroundColor: 'transparent',
                color: fontColor,
                width: '100%',
                border: 'none'
              }}>
              <div className="feedback-button-container">
                <button className="feedback-button" onClick={() => handleFeedbackButton("Thanks, that's helped me", true)}>That's Helped</button>
                <button className="feedback-button" onClick={() => handleFeedbackButton("Need More Information", false)}>Need More Information</button>
              </div>
            </div>
          </div>
          : null
      }
      {
        showHumanButton && showHumanSupportButton && payload?.isLast && !payload?.isFirstMessage ?
          <div className="docsbot-chat-bot-message-container support-box-container">
            <div className="docsbot-chat-bot-message"
              style={{
                backgroundColor: 'transparent',
                color: fontColor,
                width: '100%',
                border: 'none'
              }}>
              <div className="feedback-button-container">
                <button className="feedback-button" onClick={() => handleFeedbackButton("Get Support", false)}>Get Support</button>
                <button className="feedback-button" onClick={() => handleFeedbackButton("No Thanks", false)}>No Thanks</button>
              </div>
            </div>
          </div>
          : null
      }
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
            <FontAwesomeIcon icon={faBullhorn} style={{ color: decideTextColor(getLighterColor(color || "#1292EE", 0.93)), marginLeft: 5 }} />
          </a>
        </div>
      )}
    </>
  );
};
