import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLink, faFile, faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { useConfig } from "../configContext/ConfigContext";

function stripLeadingWww(hostname) {
  if (!hostname) return "";
  return hostname.replace(/^www\./i, "");
}

function parseUrlHostname(urlString) {
  if (!urlString || typeof urlString !== "string") return "";
  try {
    const host = new URL(urlString).hostname || "";
    return stripLeadingWww(host);
  } catch {
    return "";
  }
}

function googleFaviconUrl(urlString) {
  const hostname = parseUrlHostname(urlString);
  if (!hostname) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
}

/** Source types that represent web pages / crawled URLs — use site favicon instead of generic link/file icon. */
const WEB_SOURCE_TYPES_FOR_FAVICON = new Set([
  "url",
  "sitemap",
  "urls",
]);

function isWebSourceTypeForFavicon(type) {
  if (type == null || type === "") return false;
  const key = String(type).trim().toLowerCase().replace(/-/g, "_");
  return WEB_SOURCE_TYPES_FOR_FAVICON.has(key);
}

function isHttpUrlString(urlString) {
  if (!urlString || typeof urlString !== "string") return false;
  try {
    const u = new URL(urlString);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function sourceDisplayBase(source) {
  const t = source.title != null ? String(source.title).trim() : "";
  if (t) return t;
  if (source.url) {
    const host = parseUrlHostname(source.url);
    return host || source.url;
  }
  return "";
}

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
  const trimmedTitle =
    source.title != null ? String(source.title).trim() : "";
  const displayText = `${sourceDisplayBase(source)}${page}`;
  const tooltipText =
    !trimmedTitle && source.url && parseUrlHostname(source.url)
      ? `${source.url}${page}`
      : displayText;
  const useSiteFavicon =
    source.url &&
    isWebSourceTypeForFavicon(source.type) &&
    isHttpUrlString(source.url);
  const faviconSrc = useSiteFavicon ? googleFaviconUrl(source.url) : null;

  const leadingIcon =
    faviconSrc != null ? (
      <img
        className="docsbot-source-favicon"
        src={faviconSrc}
        alt=""
        width={16}
        height={16}
        loading="lazy"
      />
    ) : null;

  return (
    <li {...(!(source.url && !shouldHideUrl) && {className: 'docsbot-sources-unlinked'})}>
		{source.url && !shouldHideUrl
		? (
			<a
				href={source.url}
				target="_blank"
				rel="noopener noreferrer"
				title={tooltipText}
			>
				<span className="docsbot-source-link-main">
					{leadingIcon}
					<span className="docsbot-source-label">{displayText}</span>
				</span>
				<span className="docsbot-source-external-icon" aria-hidden>
					<FontAwesomeIcon icon={faArrowUpRightFromSquare} />
				</span>
			</a>
		)
		: (
			<>
				{leadingIcon || <FontAwesomeIcon icon={icon} />}
				<span className="docsbot-source-label" title={tooltipText}>
					{displayText}
				</span>
			</>
		)}
    </li>
  );
};
