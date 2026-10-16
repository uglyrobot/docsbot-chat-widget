// Keep transport text independent of the compact, human-readable transcript.
// Plain text also survives the existing API's question/history persistence.
export function buildOpenUIActionMessage(event) {
  if (!event || event.type !== 'continue_conversation') return null;
  const display = String(event.humanFriendlyMessage || 'Form submitted').slice(0, 1000);
  const data = { form: event.formName || null, values: event.formState || {}, context: event.params ?? null };
  let encoded;
  try { encoded = JSON.stringify(data); } catch { return null; }
  if (encoded.length > 10000) return null;
  return `User clicked: ${display}\nUI submission: ${encoded}`;
}

export function readOpenUIActionMessage(message) {
  if (typeof message !== 'string') return null;
  const match = /^User clicked: ([\s\S]+)\nUI submission: (\{[^\n]*\})$/.exec(message);
  if (!match) return null;
  try {
    const data = JSON.parse(match[2]);
    if (!data || typeof data.values !== 'object' || data.values === null || Array.isArray(data.values)) return null;
    return { display: match[1], ...data, entries: formEntries(data.values) };
  } catch { return null; }
}

function formEntries(values, prefix = '', depth = 0) {
  if (depth > 4) return [];
  return Object.entries(values).flatMap(([key, field]) => {
    const label = prefix ? `${prefix} / ${key}` : key;
    const value = field && typeof field === 'object' && 'value' in field ? field.value : field;
    if (value && typeof value === 'object' && !Array.isArray(value)) return formEntries(value, label, depth + 1);
    if (value === null || value === undefined || value === '') return [];
    return [{ label, value: Array.isArray(value) ? value.map(String).join(', ') : String(value) }];
  });
}

export function dispatchOpenUIAction(detail, target = globalThis.document, EventImpl = globalThis.CustomEvent) {
  if (!target?.dispatchEvent || typeof EventImpl !== 'function') return true;
  // Returning false means the host synchronously took ownership with preventDefault().
  return target.dispatchEvent(new EventImpl('docsbot_ui_action', { detail, cancelable: true }));
}
