import { createContext, useContext, useEffect, useState } from "react";

const ConfigContext = createContext();

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error(`useConfig must be used within a ConfigProvider`);
  }
  return context;
}

export function ConfigProvider(props = {}) {
  const { id, supportCallback, children } = props;
  const [config, setConfig] = useState(null);

  useEffect(() => {
    if (id && !config) {
      const apiUrl = `http://localhost:3001/api/widget/${id}`;

      fetch(apiUrl, {
        method: "GET",
      })
        .then((response) => response.json())
        .then((data) => {
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
