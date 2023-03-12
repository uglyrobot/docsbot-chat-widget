import React from 'react';
import { useConfig } from "../configContext/ConfigContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComment, faRobot, faLifeRing, faInfo, faBook } from "@fortawesome/free-solid-svg-icons";


export const BotAvatar = () => {
    const { colors, botIcon } = useConfig();

  //icon can be default, robot, life-ring, or question-circle
  const iconMap = {
    comment: faComment,
    robot: faRobot,
    "life-ring": faLifeRing,
    info: faInfo,
    book: faBook,
  };

  const iconToUse = iconMap[botIcon] || iconMap.robot;

  if (botIcon === false) {
    return null;
  }
  return (
    <div className="react-chatbot-kit-chat-bot-avatar">
      <div className="react-chatbot-kit-chat-bot-avatar-container">
        <p className="react-chatbot-kit-chat-bot-avatar-letter"><FontAwesomeIcon icon={iconToUse} /></p>
      </div>
    </div>
  );
};

