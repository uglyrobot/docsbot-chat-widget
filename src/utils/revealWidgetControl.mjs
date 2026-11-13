// Reveal newly presented controls inside the widget, without moving the host page.
export function revealWidgetControl(container, element, inset = 48) {
  if (!container || !element) return;
  const viewport = container.getBoundingClientRect();
  const control = element.getBoundingClientRect();
  const availableInset = Math.min(inset, Math.max(0, viewport.height - 1));
  const delta = control.bottom - (viewport.bottom - availableInset);
  if (delta > 0) container.scrollTop += delta;
}
