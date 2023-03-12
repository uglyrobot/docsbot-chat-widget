import { useEffect, useState } from "react";
import { Loader } from "../loader/Loader";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRobot,
  faChevronDown,
  faLink,
  faFile,
} from "@fortawesome/free-solid-svg-icons";
import { remark } from "remark";
import html from "remark-html";
import remarkGfm from "remark-gfm";
import { useConfig } from "../configContext/ConfigContext";
import { ThemeColors } from "../../constants/theme";

export const MessageWidget = (props) => {
  const { teamId, botId, message } = props.state.payload;
  const [loading, setLoading] = useState();
  const [apiResults, setApiResults] = useState();
  const [answerHtml, setAnswerHtml] = useState("");
  const [error, setError] = useState();
  const [showSources, setShowSources] = useState(false);
  const { colors } = useConfig();

  useEffect(() => {
    setLoading(true);
    fetch(`https://api.docsbot.ai/teams/${teamId}/bots/${botId}/ask`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question: message }),
    })
      .then((response) => {
        if (response.status >= 200 && response.status < 300) {
          return Promise.resolve(response);
        } else {
          return Promise.reject(new Error(response));
        }
      })
      .then((response) => response.json())
      .then((json) => {
        setApiResults(json);
        setLoading(false);
      })
      .catch((error) => {
        setLoading(false);
        console.log(error);
        setError(
          "I'm sorry, I don't understand what you're asking. Can you please provide more context or a specific question related to Infinite Uploads?"
        );
      });
  }, [setApiResults, teamId, botId, message]);

  //convert markdown to html when answer changes or is appended to
  useEffect(() => {
    if (apiResults?.answer) {
      remark()
        .use(html)
        .use(remarkGfm)
        .process(apiResults?.answer)
        .then((html) => {
          setAnswerHtml(html.toString());
        });
    }
  }, [apiResults, setAnswerHtml]);

  const Source = ({ source }) => {
    const icon = source.url ? faLink : faFile;
    const page = source.page ? ` - Page ${source.page}` : "";

    return (
      <li>
        <FontAwesomeIcon icon={icon} a />
        {source.url ? (
          <a href={source.url} target="_blank"
          rel="noopener norefferer">
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

  return (
    <div className="react-chatbot-kit-chat-bot-message-container">
      <div className="react-chatbot-kit-chat-bot-avatar">
        <div className="react-chatbot-kit-chat-bot-avatar-container">
          <p className="react-chatbot-kit-chat-bot-avatar-letter">
            <FontAwesomeIcon icon={faRobot} />
          </p>
        </div>
      </div>
      <div
        className="react-chatbot-kit-chat-bot-message"
        style={{ backgroundColor: colors?.primary || ThemeColors.primaryColor }}
      >
        {(() => {
          if (loading) {
            return <Loader />;
          }

          if (error) {
            return <span>{error}</span>;
          }

          if (apiResults) {
            return (
              <>
                <span dangerouslySetInnerHTML={{ __html: answerHtml }} />
                <button onClick={() => setShowSources(!showSources)}>
                  Sources <FontAwesomeIcon icon={faChevronDown} />
                </button>
                {showSources && (
                  <ul className="docsbot-sources">
                    {apiResults?.sources?.map((source, index) => (
                      <Source key={index} source={source} />
                    ))}
                  </ul>
                )}
              </>
            );
          }
        })()}
        <div
          className="react-chatbot-kit-chat-bot-message-arrow"
          style={{
            borderRightColor: colors?.primary || ThemeColors.primaryColor,
          }}
        ></div>
      </div>
    </div>
  );
};
