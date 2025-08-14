import { useEffect } from 'react'
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faComment,
  faComments,
  faRobot,
  faLifeRing,
  faQuestion,
  faBook,
  faXmark,
} from "@fortawesome/free-solid-svg-icons"
import { useConfig } from "../configContext/ConfigContext"
import { decideTextColor } from "../../utils/colors"
import clsx from "clsx"

export const FloatingButton = ({ isOpen, setIsOpen }) => {
  const { color, icon, labels, showButtonLabel, alignment, horizontalMargin, verticalMargin } =
    useConfig()

  //icon can be default, robot, life-ring, or question-circle
  const iconMap = {
    default: faComment,
    comments: faComments,
    robot: faRobot,
    "life-ring": faLifeRing,
    question: faQuestion,
    book: faBook,
  }

  const isIconInList = iconMap.hasOwnProperty(icon) || !icon // if empty string, use default icon

  useEffect(() => {
	const root = document.documentElement;
	const primaryColor = color || "#1292EE";

	root.style.setProperty('--docsbot-floating-button--bg', primaryColor);
	root.style.setProperty('--docsbot-floating-button--color', decideTextColor(primaryColor));
  }, []);

  return (
    <button
      id="docsbot-toggle-button"
      type="button"
      className={clsx(
        showButtonLabel ? "has-label" : "",
        alignment === "left" ? "docsbot-left" : "",
        isOpen ? "is-open" : "",
        "floating-button"
      )}
      part="button"
      onClick={() => {
        setIsOpen(!isOpen)
      }}
      style={{
        left: alignment === "left" ? horizontalMargin || 20 : "auto",
        right: alignment === "right" ? horizontalMargin || 20 : "auto",
        bottom: verticalMargin || 20,
      }}
      aria-label={!showButtonLabel ? (labels?.floatingButton || 'Open chat') : undefined}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      aria-controls="docsbot-chat-dialog">
        <div className="floating-button-icon">
          { isIconInList
            ? <FontAwesomeIcon size="xl" icon={iconMap[icon] || iconMap.default} className="floating-button-icon--open" />
            : <img src={icon} alt="" aria-hidden="true" className="floating-button-icon--open" /> }
          <FontAwesomeIcon size="xl" icon={faXmark} className="floating-button-icon--close" />
        </div>
      {showButtonLabel ? (
        <span className="floating-button-label">{labels.floatingButton}</span>
      ) : null}
    </button>
  )
}
