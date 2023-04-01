import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faComment,
  faComments,
  faRobot,
  faLifeRing,
  faQuestion,
  faBook,
} from "@fortawesome/free-solid-svg-icons";
import { useConfig } from "../configContext/ConfigContext";
import { decideTextColor } from "../../utils/colors";

export const FloatingButton = ({ onClick }) => {
  const { color, icon } = useConfig();

  //icon can be default, robot, life-ring, or question-circle
  const iconMap = {
    default: faComment,
    comments: faComments,
    robot: faRobot,
    "life-ring": faLifeRing,
    question: faQuestion,
    book: faBook,
  };

  const iconToUse = iconMap[icon] || iconMap.default;

  return (
    <a
      href="#"
      className="floating-button"
      onClick={onClick}
      style={{
        backgroundColor: color,
        color: decideTextColor(color || "#1292EE"),
      }}
    >
      <FontAwesomeIcon size="xl" icon={iconToUse} />
    </a>
  );
};
