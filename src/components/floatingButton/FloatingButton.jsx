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

export const FloatingButton = ({
  isOpen,
  setIsOpen,
  launcherRef,
  chatPanelId,
}) => {
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
	root.style.setProperty('--docsbot-floating-button--focus-ring', primaryColor);
  }, []);

  const buttonLabel = isOpen
    ? labels?.close || "Close"
    : labels?.floatingButton || "Help"

  return (
    <button
      type="button"
      className={clsx(
        showButtonLabel ? "has-label" : "",
        alignment === "left" ? "docsbot-left" : "",
        isOpen ? "is-open" : "",
        "floating-button"
      )}
      part="button"
      onClick={(e) => {
        e.preventDefault()
        setIsOpen(!isOpen)
      }}
      aria-expanded={isOpen}
      aria-controls={chatPanelId}
      aria-label={buttonLabel}
      style={{
        left: alignment === "left" ? horizontalMargin || 20 : "auto",
        right: alignment === "right" ? horizontalMargin || 20 : "auto",
        bottom: verticalMargin || 20,
      }}
      ref={launcherRef}>
        <div className="floating-button-icon" aria-hidden="true">
          { isIconInList
            ? <FontAwesomeIcon size="xl" icon={iconMap[icon] || iconMap.default} className="floating-button-icon--open" />
            : <img src={icon} alt="" className="floating-button-icon--open" /> }
          <FontAwesomeIcon size="xl" icon={faXmark} className="floating-button-icon--close" />
        </div>
      {showButtonLabel ? (
        <span className="floating-button-label">{labels.floatingButton}</span>
      ) : null}
    </button>
  )
}
