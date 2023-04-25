import { createContext, useContext, useEffect, useState } from "react";
import random from "random";

const ConfigContext = createContext();

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error(`useConfig must be used within a ConfigProvider`);
  }
  return context;
}

const grabQuestions = (questions) => {
  // grab at most 3 unique questions from the bot
  if (questions) {
    const randomQuestions = []
    const questionsLimit = questions.length > 3 ? 3 : questions.length

    for (let i = 0; i < questionsLimit; i++) {
      const randomIndex = random.int(0, questions.length - 1)

      // check if question is already included
      if (randomQuestions.includes(questions[randomIndex])) {
        i--
        continue
      }

      randomQuestions.push(questions[randomIndex])
    }

    return randomQuestions
  }

  return []
}

export function ConfigProvider(props = {}) {
  const { id, supportCallback, children } = props;
  const [config, setConfig] = useState(null);

  useEffect(() => {
    if (id && !config) {
      const apiUrl = `https://docsbot.ai/api/widget/${id}`;

      fetch(apiUrl, {
        method: "GET",
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.questions) {
            data.questions = grabQuestions(data.questions) // limit the number of questions
          } else {
            data.questions = []
          }

          console.log(data)
          setConfig({ ...data, supportCallback });
        })
        .catch((e) => {
          console.warn(e);
        });
    }
  }, [id, config]);

  if (!config) return null;

  return (
    <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
  );
}
