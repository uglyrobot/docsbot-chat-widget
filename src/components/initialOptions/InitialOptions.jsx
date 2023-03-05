export const InitialOptions = (props) => {
  const options = [
    {
      text: "Need help using Docsbot",
      handler: props.actionProvider.handleJavascriptList,
      id: 1,
    },
    {
      text: "Give me a random fact",
      handler: props.actionProvider.handleRandomFact,
      id: 2,
    },
  ];

  const optionsMarkup = options.map((option) => (
    <button
      className="initial-option-button"
      key={option.id}
      onClick={option.handler}
    >
      {option.text}
    </button>
  ));

  return <div className="initial-options-container">{optionsMarkup}</div>;
};
