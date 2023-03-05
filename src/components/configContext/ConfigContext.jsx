import { createContext, useContext, useMemo } from "react";

const ConfigContext = createContext();

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error(`useConfig must be used within a ConfigProvider`);
  }
  return context;
}

export function ConfigProvider(props = {}) {
  const { apiKey, children } = props;
  const value = useMemo(
    () => ({
      apiKey,
    }),
    [apiKey]
  );
  return (
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  );
}
