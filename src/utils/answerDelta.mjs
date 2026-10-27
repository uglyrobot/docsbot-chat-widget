// JSON framing preserves every answer byte, including leading newlines, in SSE.
export function decodeAnswerDelta(data) {
 if (typeof data !== 'string') return ''
 try { const value=JSON.parse(data); return typeof value?.delta==='string'?value.delta:'' } catch { return '' }
}
