import { manifest, componentNames } from '../components/generativeUi/contract.mjs'

export function cleanGenerativeUiPayload(payload, { streaming = false } = {}) {
  if (!payload || typeof payload.response !== 'string' || payload.libraryVersion !== manifest.componentLibraryVersion || payload.specSha256 !== manifest.specSha256) return null
  const response = streaming ? payload.response.trimStart() : payload.response.trim()
  if (!response || new TextEncoder().encode(response).length > 16000 || response.split('\n').filter(x => x.trim()).length > 180 || !/^root\s*=\s*Stack\s*\(/.test(response) || /javascript:|<script|<iframe|data:text\/html|^```/im.test(response)) return null
  const syntax = response.replace(streaming ? /"(?:\\.|[^"\\])*(?:"|$)/g : /"(?:\\.|[^"\\])*"/g, '""')
  const functions = [...syntax.matchAll(/@([A-Za-z_]\w*)\s*\(/g)]
  if (functions.some(x => x[1] !== 'ToAssistant') || /[<>]/.test(syntax)) return null
  const allowed = new Set(componentNames)
  const calls = [...syntax.matchAll(/\b([A-Z][A-Za-z0-9]*)\s*\(/g)]
  if (!calls.length || calls.some(x => !allowed.has(x[1]) && x[1] !== 'ToAssistant')) return null
  return { ...payload, response }
}
