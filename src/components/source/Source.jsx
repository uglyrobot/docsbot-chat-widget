import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLink, faFile, faArrowUpRightFromSquare, faPlay, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useRef, useState } from "react";
import { useConfig } from "../configContext/ConfigContext";
import { getSourceInlineMedia } from "../../utils/sourceMedia.mjs";

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
  const { noURLSourceTypes, hideSources, inlineMediaSourcePlayer, labels } = useConfig();
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const mediaRef = useRef(null);
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
  const inlineMedia = inlineMediaSourcePlayer
    ? getSourceInlineMedia(source)
    : null;
  const canOpenInlineMedia =
    inlineMedia != null && source.url && !shouldHideUrl;

  useEffect(() => {
    if (!isPlayerOpen || !mediaRef.current || inlineMedia?.kind === "youtube") {
      return;
    }

    const media = mediaRef.current;
    if (inlineMedia?.start > 0) {
      const setStartTime = () => {
        try {
          media.currentTime = inlineMedia.start;
        } catch {
          // Some signed media URLs reject seeking until metadata is fully available.
        }
      };

      if (media.readyState >= 1) {
        setStartTime();
      } else {
        media.addEventListener("loadedmetadata", setStartTime, { once: true });
        return () => media.removeEventListener("loadedmetadata", setStartTime);
      }
    }
  }, [inlineMedia, isPlayerOpen]);

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
    <li
      className={[
        !(source.url && !shouldHideUrl) ? 'docsbot-sources-unlinked' : '',
        canOpenInlineMedia ? 'docsbot-source-has-media' : '',
        isPlayerOpen ? 'is-media-open' : '',
      ].filter(Boolean).join(' ') || undefined}
    >
		{source.url && !shouldHideUrl
		? (
      <div className="docsbot-source-link-row">
        {canOpenInlineMedia ? (
          <button
            type="button"
            className="docsbot-source-inline-button"
            title={tooltipText}
            aria-expanded={isPlayerOpen}
            onClick={() => setIsPlayerOpen((open) => !open)}
          >
            <span className="docsbot-source-link-main">
              {leadingIcon || (
                <span className="docsbot-source-play-icon" aria-hidden>
                  <FontAwesomeIcon icon={isPlayerOpen ? faChevronUp : faPlay} />
                </span>
              )}
              <span className="docsbot-source-label">{displayText}</span>
            </span>
          </button>
        ) : (
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
        )}

        {canOpenInlineMedia && (
          <a
            className="docsbot-source-external-button"
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={labels?.openSource || tooltipText}
          >
            <span className="docsbot-screen-reader-only">
              {labels?.openSource || 'Open source'}
            </span>
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden />
          </a>
        )}
      </div>
		)
		: (
			<>
				{leadingIcon || <FontAwesomeIcon icon={icon} />}
				<span className="docsbot-source-label" title={tooltipText}>
					{displayText}
				</span>
			</>
		)}
      {canOpenInlineMedia && isPlayerOpen && (
        <div className="docsbot-source-media-player">
          {inlineMedia.kind === "youtube" ? (
            <iframe
              src={inlineMedia.src}
              title={displayText}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : inlineMedia.kind === "audio" ? (
            // Source payloads do not include caption track URLs.
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio ref={mediaRef} src={inlineMedia.src} controls autoPlay preload="metadata" />
          ) : (
            // Source payloads do not include caption track URLs.
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video ref={mediaRef} src={inlineMedia.src} controls autoPlay preload="metadata" playsInline />
          )}
        </div>
      )}
    </li>
  );
};
