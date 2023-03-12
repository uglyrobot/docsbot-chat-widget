import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLink, faFile } from "@fortawesome/free-solid-svg-icons";

export const Source = ({ source }) => {
  const icon = source.url ? faLink : faFile;
  const page = source.page ? ` - Page ${source.page}` : "";

  return (
    <li>
      <FontAwesomeIcon icon={icon} a />
      {source.url ? (
        <a href={source.url} target="_blank" rel="noopener norefferer">
          {source.title}
          {page}
        </a>
      ) : (
        <span>
          {source.title || source.url}
          {page}
        </span>
      )}
    </li>
  );
};
