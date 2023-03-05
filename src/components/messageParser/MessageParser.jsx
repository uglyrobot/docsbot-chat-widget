import React from "react";

export const MessageParser = ({ children, actions }) => {
  const parse = (message) => {
    actions.handleFetchData(message);
  };

  return (
    <div>
      {React.Children.map(children, (child) => {
        return React.cloneElement(child, {
          parse,
          actions,
        });
      })}
    </div>
  );
};
