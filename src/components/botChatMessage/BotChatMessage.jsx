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
import { UserChatMessage } from "../userChatMessage/UserChatMessage";

export const BotChatMessage = ({ payload, showSupportMessage, setShowSupportMessage, fetchAnswer, showFeedbackButton, showHumanButton, suppportTabRef, timeoutLoader, setTimeoutLoader, messageBoxRef }) => {
  const [showSources, setShowSources] = useState(false);
  const [isFlagged, setIsFlagged] = useState(false)
  const [rating, setRating] = useState(payload.rating || 0);
  const [fieldsValue, setFieldsValue] = useState({})
  const [currentStep, setCurrentStep] = useState(0)
  const [isShowSaved, setIsShowSaved] = useState(false)
  const [showHumanSupportButton, setShowHumanSupportButton] = useState(false)
  const [showUserMsgKeys, setUserMsgKeys] = useState({})
  const { color, teamId, botId, signature, hideSources, labels, supportLink, supportCallback, identify, updateIdentify, leadFields, collectLead
  } = useConfig();
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

  const runSupportCallback = (e, history, metadata) => {
    // post to api endpoint
    const apiUrl = `https://api.docsbot.ai/teams/${teamId}/bots/${botId}/conversations/${payload.id}/escalate`;

    fetch(apiUrl, {
      method: "PUT",
      headers,
    })
      .then(() => {
        window.open(supportLink, "_blank")
      })
      .catch((e) => {
        console.warn(`DOCSBOT: Error recording support click: ${e}`);
      });

    // run callback if provided
    if (supportCallback && typeof supportCallback === "function") {
      supportCallback(e, history, metadata)
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

  const capitalizeText = (text) => {
    if (text) {
      return text?.charAt(0).toUpperCase() + text?.slice(1);
    }
    else {
      return ""
    }
  }

  const handleFieldChange = (event) => {
    const { name, value } = event.target
    setFieldsValue((old) => {
      return {
        ...old,
        [name]: value
      }
    })
  }

  const handleNext = (e) => {
    const lastStep = leadFields?.length - 1
    const currentStepFields = leadFields[currentStep]
    const currentStepFieldValue = fieldsValue[currentStepFields.key]
    if (currentStepFields.required && !currentStepFieldValue?.trim().length) {
      return false
    }
    else {
      if (currentStepFieldValue?.trim().length && currentStepFields.key === 'email') {
        const isValidEmail = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(currentStepFieldValue);
        if (isValidEmail) {
          if (currentStep >= lastStep) {
            handleContact(e, fieldsValue)
          }
          else {
            setCurrentStep(currentStep + 1)
          }
          setUserMsgKeys((old) => {
            return {
              ...old,
              [currentStepFields.key]: 1
            }
          })
        }
        else return false
      }
      else {
        if (currentStep >= lastStep) {
          handleContact(e, fieldsValue)
        }
        else {
          setCurrentStep(currentStep + 1)
        }
        setUserMsgKeys((old) => {
          return {
            ...old,
            [currentStepFields.key]: 1
          }
        })
      }
    }
  }

  const getButtonState = () => {
    const currentStepFields = leadFields[currentStep]
    if (currentStepFields.required) {
      return false
    }
    else {
      return true
    }
  }

  const handleContact = (e, userData) => {
    const newUserData = {}
    Object.keys(userData).map(data => {
      newUserData[data] = userData[data]?.trim()
    })
    updateIdentify(newUserData)
    let metadata = identify;
    metadata = {
      ...metadata,
      ...newUserData
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

    localStorage.setItem('userContactDetails', JSON.stringify(newUserData))
    if (collectLead === "escalation") {
      runSupportCallback(e, state.chatHistory || [], identify)
    }
    setShowSupportMessage(false)
    setIsShowSaved(true)
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
    fetchAnswer(message);
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
          ref={messageBoxRef}
        >
          {(() => {
            if (payload.loading) {
              return <Loader />;
            }

            return (
              <>
                <span dangerouslySetInnerHTML={{ __html: payload.message }} />
                {payload.sources?.length ?
                  (
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
                  ) : null}
              </>
            );
          })()}
        </div>
      </div>
      {
        timeoutLoader && payload?.isLast ?
          <div ref={suppportTabRef} className="docsbot-chat-bot-message-container support-box-container">
            <div className="docsbot-chat-bot-message"
              style={{
                background: bgColor,
                color: fontColor
              }}
            >
              <Loader />
            </div>
          </div> : null
      }

      {
        showSupportMessage && payload?.isLast ?
          <div ref={suppportTabRef} className="docsbot-chat-bot-message-container support-box-container">
            <div className="docsbot-chat-bot-message"
              style={{
                background: bgColor,
                color: fontColor
              }}
            >
              <p>Let us know how to contact you?</p>
            </div>
          </div> : null
      }
      {
        Object.keys(fieldsValue).map((message, messageKey) => {
          if (fieldsValue[message] && showUserMsgKeys[message]) {
            return <UserChatMessage key={messageKey} loading={false} message={`${capitalizeText(message)} : ${fieldsValue[message]}`} />
          }
        }
        )
      }
      {
        showSupportMessage && payload?.isLast ?
          <div ref={suppportTabRef} className="docsbot-chat-bot-message-container support-box-container">
            <div className="docsbot-chat-bot-message chat-support-message-box">
              <div className="support-box-form-container">
                {
                  leadFields?.map((field, fieldIndex) => {
                    return fieldIndex === currentStep ? <div style={{ display: 'flex', flexDirection: 'column', gap: "8px" }} key={fieldIndex}>
                      <div className="label-xbutton-container">
                        <label style={{ fontWeight: '500', fontSize: "1rem" }}>{field.name}</label>
                        {
                          getButtonState() ?
                            <button><FontAwesomeIcon size="xl" icon={faXmark} onClick={handleNext} /></button> : null
                        }
                      </div>
                      <input type={field.type} name={field.key} value={fieldsValue[field.key] || ''} onChange={handleFieldChange} />
                    </div> : null
                  })
                }
                {
                  <button style={{
                    backgroundColor: color,
                    color: decideTextColor(color),
                  }} className="next-buttom" onClick={handleNext}><FontAwesomeIcon icon={faChevronRight} size='lg' /></button>
                }
              </div>
            </div>
          </div>
          : null
      }

      {
        isShowSaved && collectLead !== "escalation" ?
          <div className="docsbot-chat-bot-message-container support-box-container">
            <div className="docsbot-chat-bot-message"
              style={{
                backgroundColor: bgColor,
                color: fontColor,
                width: '100%'
              }}>
              <div>
                <p>Your details has been saved successfully!</p>
              </div>
            </div>
          </div>
          : null
      }
      {
        showFeedbackButton && !showHumanButton && payload?.isFeedback && payload?.isLast && !payload?.isFirstMessage ?
          <div className="docsbot-chat-bot-message-container support-box-container">
            <div className="docsbot-chat-bot-message"
              style={{
                backgroundColor: 'transparent',
                color: fontColor,
                width: '100%',
                border: 'none'
              }}>
              <div className="feedback-button-container">
                <button className="feedback-button" onClick={() => handleFeedbackButton("Yes", true)}>Yes</button>
                <button className="feedback-button" onClick={() => handleFeedbackButton("No", false)}>No</button>
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
                <button className="feedback-button" onClick={(e) => {
                  const userDetails = JSON.parse(localStorage.getItem('userContactDetails'))
                  if (collectLead === "escalation" && !userDetails) {
                    setTimeoutLoader(true)
                    setTimeout(() => {
                      setShowSupportMessage(true)
                      setTimeoutLoader(false)
                    }, 1000)
                  }
                  else {
                    runSupportCallback(e, state.chatHistory || [], identify)
                  }
                  setShowHumanSupportButton(false)
                }}>{labels.getSupport}
                </button>
                <button className="feedback-button" onClick={() => setShowHumanSupportButton(false)}>No Thanks</button>
              </div>
            </div>
          </div>
          : null
      }
    </>
  );
};
