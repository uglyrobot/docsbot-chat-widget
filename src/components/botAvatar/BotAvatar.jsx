import React from "react"
import { useConfig } from "../configContext/ConfigContext"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faComment, faRobot, faLifeRing, faInfo, faBook } from "@fortawesome/free-solid-svg-icons"
import { decideTextColor, getLighterColor } from "../../utils/colors"

export const BotAvatar = () => {
  const { botIcon, color } = useConfig()

  const bgColor = getLighterColor(color || "#1292EE", 0.6)
  const fontColor = decideTextColor(bgColor)

  //icon can be default, robot, life-ring, or question-circle
  const iconMap = {
    comment: faComment,
    robot: faRobot,
    "life-ring": faLifeRing,
    info: faInfo,
    book: faBook,
  }

  const iconToUse = iconMap[botIcon] || false
  const isIconInList = iconMap.hasOwnProperty(botIcon)

  // if there is no url string, and the icon is not in the list of icons, don't show an avatar
  if (iconToUse === false && !botIcon) {
    return null;
  }

  return (
    <div className="docsbot-chat-bot-avatar">
      <div
        className="docsbot-chat-bot-avatar-container"
        style={{
          backgroundColor: bgColor,
        }}>
        <p
          className="docsbot-chat-bot-avatar-icon"
          style={{
            color: fontColor,
          }}>
          {isIconInList ? (
            <FontAwesomeIcon icon={iconToUse} size="xs" />
          ) : (
            <img src={botIcon} alt="Bot Avatar" />
          )}
        </p>
      </div>
    </div>
  )
}
