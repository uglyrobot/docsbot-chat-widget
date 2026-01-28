import { createContext, useContext, useEffect, useState } from "react";

const ConfigContext = createContext();

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error(`useConfig must be used within a ConfigProvider`);
  }
  return context;
}

const grabQuestions = (questions, limit = 3) => {
  // grab at most `limit` unique questions from the bot
  if (questions) {
    const randomQuestions = []
    const questionsLimit = questions.length > limit ? limit : questions.length

    for (let i = 0; i < questionsLimit; i++) {
      const randomIndex = Math.floor(Math.random() * questions.length)

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
  const { id, supportCallback, identify, options, signature, children } = props;
  const [config, setConfig] = useState(null);

  // update the identify object metadata in the config context. Called from lead collection tool response
  const updateIdentity = (data) => {
    setConfig((prevConfig) => {
      return {
        ...prevConfig,
        identify: {
          ...prevConfig.identify,
          ...data
        }
      }
    })
  }

  const localDev = options?.localDev;

  useEffect(() => {
    if (id && !config) {
      const baseUrl = localDev ? 'http://localhost:3000/api' : 'https://docsbot.ai/api';
      const apiUrl = `${baseUrl}/widget/${id}`;
      const [teamId, botId] = props.id.split('/');

      fetch(apiUrl, {
        method: "GET",
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.questions) {
            data.questions = grabQuestions(data.questions, options?.suggestedQuestions) // limit the number of questions
          } else {
            data.questions = []
          }

          //check that current domain is in the list of allowed domains
          if (data.allowedDomains && data.allowedDomains.length > 0) {
            const currentDomain = window.location.hostname
            const allowedDomains = data.allowedDomains.map(domain => domain.toLowerCase())
            //always allow:
            allowedDomains.push('localhost')
            allowedDomains.push('docsbot.ai')

            if (!allowedDomains.includes(currentDomain.toLowerCase())) {
              console.warn(`DOCSBOT: Current domain (${currentDomain}) is not in the list of allowed domains (${allowedDomains.join(', ')})`)
              return
            }
          }

          // Create a clean copy of options without the labels property. No overwriting of branding or allowedDomains (security measure).
          const { labels: optionsLabels, branding, allowedDomains: optionsAllowedDomains, ...restOptions } = options || {};
          
          // Merge labels ensuring undefined values in options.labels use defaults from data.labels
          const mergedLabels = optionsLabels
            ? { ...data.labels, ...Object.entries(optionsLabels).reduce((acc, [key, value]) => {
                if (value !== undefined) {
                  acc[key] = value;
                }
                return acc;
              }, {}) }
            : data.labels;

          setConfig({ 
            ...data, 
            teamId,
            botId,
            supportCallback, 
            identify: identify || {}, 
            signature, 
            ...restOptions,
            labels: mergedLabels
            // allowedDomains is intentionally not included from restOptions - it can only come from API response for security
          });
        })
        .catch((e) => {
          console.warn(`DOCSBOT: Error fetching config: ${e}`);
        });
    }
  }, [id, config, localDev]);

  if (!config) return null;

  return (
    <ConfigContext.Provider value={{ ...config, updateIdentity }}>{children}</ConfigContext.Provider>
  );
}
