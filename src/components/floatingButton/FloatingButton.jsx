import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComment } from "@fortawesome/free-solid-svg-icons";
import { ThemeColors } from "../../constants/theme";
import "./FloatingButton.css";

export const FloatingButton = ({ onClick }) => {
  return (
    <a
      href="#"
      className="floating-button"
      onClick={onClick}
      style={{ background: ThemeColors.TEAL }}
    >
      <FontAwesomeIcon size="xl" icon={faComment} />
    </a>
  );
};
