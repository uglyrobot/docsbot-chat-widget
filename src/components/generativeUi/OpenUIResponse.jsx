import React, { lazy, Suspense } from 'react'
let rendererPromise
export function preloadOpenUIRenderer() {
  // Suppress the renderer's development-only CDN inspector before loading it.
  globalThis[Symbol.for('openui.devtools.autoMount')] = true
  if (!rendererPromise) rendererPromise = import(/* webpackChunkName: "docsbot-openui" */ './OpenUIRenderer')
  return rendererPromise
}
const Renderer = lazy(preloadOpenUIRenderer)
export function OpenUIResponse(props) {
  if (!props.payload?.response) return null
  return <Suspense fallback={null}><Renderer {...props} /></Suspense>
}
