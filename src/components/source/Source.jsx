import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLink, faFile, faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { useConfig } from "../configContext/ConfigContext";

export const Source = ({ source }) => {
  const { noURLSourceTypes, hideSources } = useConfig();
  const ALWAYS_HIDE_SOURCE_TYPES = [
    'helpscout',
    'freshdesk',
    'zendesk-tickets',
    'intercom-tickets',
    'jira-issues',
    'qa'
  ];

  // If hideSources is an array, check if this source type should be hidden
  if (Array.isArray(hideSources) && hideSources.includes(source.type)) {
    return null;
  }
  
  // Check if source type matches hideSourceTypes or is in ALWAYS_HIDE_SOURCE_TYPES
  const shouldHideUrl = (noURLSourceTypes &&
    (Array.isArray(noURLSourceTypes)
      ? noURLSourceTypes.includes(source.type)
      : noURLSourceTypes === source.type)) ||
    ALWAYS_HIDE_SOURCE_TYPES.includes(source.type);

  const icon = source.url && !shouldHideUrl ? faLink : faFile;
  const page = source.page ? ` - Page ${source.page}` : "";

  return (
    <li {...(!(source.url && !shouldHideUrl) && {className: 'docsbot-sources-unlinked'})}>
		{source.url && !shouldHideUrl
		? (
			<a href={source.url} target="_blank" rel="noopener norefferer">
				<span>{source.title}{page}</span>
				<FontAwesomeIcon icon={faArrowUpRightFromSquare} />
			</a>
		)
		: (
			<>
				<FontAwesomeIcon icon={icon} />
				<span>{source.title}{page}</span>
			</>
		)}
    </li>
  );
};
