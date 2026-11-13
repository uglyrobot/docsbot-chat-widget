// The visitor capability belongs to one bot and one server-issued conversation.
export const helpdeskStorageKey = (teamId, botId) => `DocsBot_${teamId}_${botId}_helpdesk`;
export function readHelpdeskSession(storage, key, conversationId) {
  try {
    const value = JSON.parse(storage.getItem(key));
    return value && value.conversationId === conversationId && typeof value.token === 'string' && value.token ? value : null;
  } catch { return null; }
}
export function isLiveHelpdesk(ticket) {
  return (ticket?.mode === 'live' || ticket?.mode === 'ticket') && ticket.aiPaused === true && ticket.status !== 'resolved';
}
export function publicHelpdeskMessages(messages) {
  return (Array.isArray(messages) ? messages : []).filter(m => m && m.type === 'reply' && m.sender === 'agent' && typeof m.id === 'string' && typeof m.text === 'string');
}

// Ignore private/malformed descriptors; never construct a download URL from a
// storage path or a URL supplied in the message body.
export function publicHelpdeskAttachments(message) {
  if (message?.type !== 'reply' || message?.sender !== 'agent') return [];
  return (Array.isArray(message.attachments) ? message.attachments : []).filter(file =>
    file && typeof file.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(file.id) &&
    typeof file.name === 'string' && file.name.trim().length > 0
  ).map(({id, name, size, mime}) => ({id, name, size, mime}));
}
export function safeHelpdeskFilename(name) {
  const cleaned = String(name || '').replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim().replace(/^\.+/, '');
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : 'download';
}
