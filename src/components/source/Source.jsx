import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLink, faFile } from "@fortawesome/free-solid-svg-icons";
import { useConfig } from "../configContext/ConfigContext";

export const Source = ({ source }) => {
  const { noURLSourceTypes } = useConfig();

  // Check if source type matches hideSourceTypes
  const shouldHideUrl = noURLSourceTypes &&
    (Array.isArray(noURLSourceTypes)
      ? noURLSourceTypes.includes(source.type)
      : noURLSourceTypes === source.type);

  const icon = source.url && !shouldHideUrl ? faLink : faFile;
  const page = source.page ? ` - Page ${source.page}` : "";

  return (
    <li>
      <FontAwesomeIcon icon={icon} />
      {source.url && !shouldHideUrl ? (
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
