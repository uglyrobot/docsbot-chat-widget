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
    <a
      role="button"
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
      style={{
        left: alignment === "left" ? horizontalMargin || 20 : "auto",
        right: alignment === "right" ? horizontalMargin || 20 : "auto",
        bottom: verticalMargin || 20,
      }}
      sr-label="Open/close chat">
        <div className="floating-button-icon">
          { isIconInList
            ? <FontAwesomeIcon size="xl" icon={iconMap[icon] || iconMap.default} className="floating-button-icon--open" />
            : <img src={icon} alt="Icon" className="floating-button-icon--open" /> }
          <FontAwesomeIcon size="xl" icon={faXmark} className="floating-button-icon--close" />
        </div>
      {showButtonLabel ? (
        <span className="floating-button-label">{labels.floatingButton}</span>
      ) : null}
    </a>
  )
}
