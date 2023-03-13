export const Options = ({ options }) => {
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
