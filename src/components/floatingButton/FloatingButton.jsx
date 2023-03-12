import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComment, faComments, faRobot, faLifeRing, faQuestionCircle, faQuestion, faBook } from "@fortawesome/free-solid-svg-icons";
import { ThemeColors } from "../../constants/theme";
import { useConfig } from "../configContext/ConfigContext";

export const FloatingButton = ({ onClick }) => {
  const { colors, icon } = useConfig();

  //icon can be default, robot, life-ring, or question-circle
  const iconMap = {
    default: faComment,
    comments: faComments,
    robot: faRobot,
    "life-ring": faLifeRing,
    "question-circle": faQuestionCircle,
    question: faQuestion,
    book: faBook,
  };

  const iconToUse = iconMap[icon] || iconMap.default;

  return (
    <a
      href="#"
      className="floating-button"
      onClick={onClick}
      style={{ backgroundColor: colors?.primary || ThemeColors.primaryColor }}
    >
      <FontAwesomeIcon size="xl" icon={iconToUse} />
    </a>
  );
};
