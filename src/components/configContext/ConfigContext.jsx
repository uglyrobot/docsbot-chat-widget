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
  const { botName, teamId, botId, colors, icon, botIcon, children } = props;
  const value = useMemo(
    () => ({
      botName,
      teamId,
      botId,
      colors,
      icon,
      botIcon
    }),
    [botName, teamId, botId, colors, icon, botIcon]
  );

  return (
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  );
}
