import React, { lazy, Suspense } from 'react'
import {useConfig} from '../configContext/ConfigContext'
let rendererPromise
export function preloadOpenUIRenderer() {
  // Suppress the renderer's development-only CDN inspector before loading it.
  globalThis[Symbol.for('openui.devtools.autoMount')] = true
  if (!rendererPromise) rendererPromise = import(/* webpackChunkName: "docsbot-openui" */ './OpenUIRenderer')
  return rendererPromise
}
const Renderer = lazy(preloadOpenUIRenderer)
class RendererLoadBoundary extends React.Component {
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  componentDidUpdate(previous){if(this.state.failed&&previous.response!==this.props.response)this.setState({failed:false})}
  render(){return this.state.failed?<p role="status">{this.props.fallbackText}</p>:this.props.children}
}
export function OpenUIResponse(props) {
  const {labels}=useConfig()
  if (!props.payload?.response) return null
  return <RendererLoadBoundary response={props.payload.response} fallbackText={props.fallbackText || labels.uiUnavailable}><Suspense fallback={null}><Renderer {...props} /></Suspense></RendererLoadBoundary>
}
