import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faComment,
  faComments,
  faRobot,
  faLifeRing,
  faQuestion,
  faBook,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { useConfig } from "../configContext/ConfigContext";
import { decideTextColor } from "../../utils/colors";
import clsx from "clsx";

export const FloatingButton = ({ isOpen, setIsOpen }) => {
  const { color, icon, labels, showButtonLabel, alignment } = useConfig();

  //icon can be default, robot, life-ring, or question-circle
  const iconMap = {
    default: faComment,
    comments: faComments,
    robot: faRobot,
    "life-ring": faLifeRing,
    question: faQuestion,
    book: faBook,
  };

  const iconToUse = isOpen ? faXmark : iconMap[icon] || iconMap.default;

  return (
    <a
      role="button"
      className={clsx(
        showButtonLabel ? "has-label" : "",
        alignment === "left" ? "docsbot-left" : "",
        isOpen ? "is-open" : "",
        "floating-button"
      )}
      onClick={(e) => {
        e.preventDefault();
        setIsOpen(!isOpen);
      }}
      style={{
        backgroundColor: color,
        color: decideTextColor(color || "#1292EE"),
      }}
      sr-label="Open/close chat"
    >
      <FontAwesomeIcon size="xl" icon={iconToUse} />
      {showButtonLabel ? (
        <span className="floating-button-label">{labels.floatingButton}</span>
      ) : null}
    </a>
  );
};
