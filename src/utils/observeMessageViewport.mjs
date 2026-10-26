// Footer/composer changes resize the viewport without necessarily scrolling it.
export function observeMessageViewport(element, update, Observer = globalThis.ResizeObserver) {
  if (!element) return () => {};
  const observer = typeof Observer === 'function' ? new Observer(update) : null;
  element.addEventListener('scroll', update);
  observer?.observe(element);
  update();
  return () => {
    observer?.disconnect();
    element.removeEventListener('scroll', update);
  };
}
