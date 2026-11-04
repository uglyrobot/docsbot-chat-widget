// Markdown ordered lists can start at up to nine digits. Count only direct
// items so nested lists get their own independent gutter.
export function orderedListGutter(start = 1, itemCount = 1) {
  const first = Number.isFinite(Number(start)) ? Math.trunc(Number(start)) : 1;
  const last = first + Math.max(0, itemCount - 1);
  const digits = Math.max(2, String(first).length, String(last).length);
  return `calc(${digits}ch + 0.75em)`;
}
