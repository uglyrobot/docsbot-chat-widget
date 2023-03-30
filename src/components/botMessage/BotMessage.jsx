import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faLink,
  faFile,
  faChevronUp,
} from "@fortawesome/free-solid-svg-icons";
import { remark } from "remark";
import html from "remark-html";
import remarkGfm from "remark-gfm";
import { useConfig } from "../configContext/ConfigContext";
import { ThemeColors } from "../../constants/theme";

export const BotMessage = ({ message, loader }) => {
  //if args is an object
  let userMessage = null;
  let systemMessage = null;
  let setState = null;
  if (typeof message === "object") {
    userMessage = message.message;
    setState = message.setState;
  } else {
    systemMessage = message;
  }

  console.log("MessageWidget", userMessage, systemMessage);
  const [loading, setLoading] = useState();
  const [apiResults, setApiResults] = useState();
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [answerHtml, setAnswerHtml] = useState("");
  const [error, setError] = useState();
  const [showSources, setShowSources] = useState(false);
  const { colors, teamId, botId, botIcon } = useConfig();

  useEffect(() => {
    if (userMessage) {
      setLoading(true);

      const req = { question: userMessage, markdown: true, history: [] };

      const apiUrl = `wss://api.docsbot.ai/teams/${teamId}/bots/${botId}/chat`;
      const ws = new WebSocket(apiUrl);

      // Send message to server when connection is established
      ws.onopen = function (event) {
        ws.send(JSON.stringify(req));
      };

      ws.onerror = function (event) {
        console.log("error", event);
        setError("There was a connection error. Please try again.");
        setLoading(false);
      };

      ws.onclose = function (event) {
        setLoading(false);
      };

      // Receive message from server word by word. Display the words as they are received.
      ws.onmessage = function (event) {
        const data = JSON.parse(event.data);
        if (data.sender === "bot") {
          if (data.type === "start") {
          } else if (data.type === "stream") {
            //append to answer
            setCurrentAnswer((prev) => {
              return prev + data.message;
            });
            setLoading(false);
          } else if (data.type === "info") {
            console.log(data.message);
          } else if (data.type === "end") {
            const finalData = JSON.parse(data.message);
            console.log(finalData);
            setState((prevState) => {
              return {
                ...prevState,
                chatHistory: finalData.history,
              };
            });
            setCurrentAnswer(finalData.answer);
            setApiResults(finalData);
            ws.close();
          } else if (data.type === "error") {
            setError(data.message);
            setLoading(false);
            ws.close();
          }
        }
      };
    }
  }, [setApiResults, teamId, botId, userMessage, setCurrentAnswer]);

  //convert markdown to html when answer changes or is appended to
  useEffect(() => {
    if (currentAnswer) {
      remark()
        .use(html)
        .use(remarkGfm)
        .process(currentAnswer)
        .then((html) => {
          setAnswerHtml(html.toString());
        });
    }
  }, [currentAnswer, setAnswerHtml]);

  const Source = ({ source }) => {
    const icon = source.url ? faLink : faFile;
    const page = source.page ? ` - Page ${source.page}` : "";

    return (
      <li>
        <FontAwesomeIcon icon={icon} />
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

  return (
    <div
      className="react-chatbot-kit-chat-bot-message"
      style={{ backgroundColor: colors?.primary || ThemeColors.primaryColor }}
    >
      {(() => {
        if (loading) {
          return loader;
        }

        if (error) {
          return <span>{error}</span>;
        }

        if (systemMessage) {
          return <span>{systemMessage}</span>;
        }

        if (answerHtml) {
          return (
            <>
              <span dangerouslySetInnerHTML={{ __html: answerHtml }} />
              {apiResults && (
                <>
                  <button onClick={() => setShowSources(!showSources)}>
                    Sources
                    {showSources ? (
                      <FontAwesomeIcon icon={faChevronUp} />
                    ) : (
                      <FontAwesomeIcon icon={faChevronDown} />
                    )}
                  </button>
                  {showSources && (
                    <ul className="docsbot-sources">
                      {apiResults?.sources?.map((source, index) => (
                        <Source key={index} source={source} />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          );
        }
      })()}
      {botIcon !== false && (
        <div
          className="react-chatbot-kit-chat-bot-message-arrow"
          style={{
            borderRightColor: colors?.primary || ThemeColors.primaryColor,
          }}
        ></div>
      )}
    </div>
  );
};
