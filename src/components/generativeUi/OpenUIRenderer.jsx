import FrozenInterface from './FrozenInterface'
import { ActionLifecycleProvider } from './ActionLifecycle'
import React, { useLayoutEffect, useRef } from 'react'
import { Renderer } from '@openuidev/react-lang'
import { ThemeProvider, useTheme } from '@openuidev/react-ui'
import { library } from './library'
import { createOpenUITheme } from './theme.mjs'
import surfaceStyles from '!raw-loader!./surface.css'
import { cleanGenerativeUiPayload } from '../../utils/generativeUiPayload.mjs'
import openuiStyles from '!raw-loader!@openuidev/react-ui/styles/index.css'
import { useConfig } from '../configContext/ConfigContext'
import { buildOpenUIActionMessage, dispatchOpenUIAction } from '../../utils/openuiActions.mjs'

class OpenUIErrorBoundary extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidUpdate(previous) { if (this.state.failed && previous.response !== this.props.response) this.setState({ failed: false }) }
  render() { return this.state.failed ? null : this.props.children }
}

function ThemeSurface({ children, isStreaming }) {
  const { theme } = useTheme()
  const ref = useRef(null)
  const labelPrefix = React.useId().replace(/:/g, "")
  const variables = Object.fromEntries(Object.entries(theme).filter(([, value]) => typeof value === 'string').map(([key, value]) => ['--openui-' + key.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z])/g, '$1-$2').replace(/([a-z])(\d)/g, '$1-$2').toLowerCase(), value]))
  useLayoutEffect(() => {
    const root = ref.current?.getRootNode()
    for (const target of [root, document.head]) {
      if (!target?.querySelector || target.querySelector('style[data-docsbot-openui]')) continue
      const style = document.createElement('style')
      style.dataset.docsbotOpenui = ''
      style.textContent = openuiStyles + surfaceStyles
      target.appendChild(style)
    }
    // Upstream TextArea/Select controls do not consistently connect their
    // FormControl labels. Associate the actual rendered control in our scope.
    const associateLabels = () => {
      ref.current?.querySelectorAll('.openui-form-control').forEach((field, index) => {
        const label = field.querySelector('label')
        const control = field.querySelector('input:not([type="hidden"]), textarea, [role="combobox"], [role="radiogroup"]')
        if (!label || !control) return
        if (!label.id) label.id = `docsbot-openui-${labelPrefix}-${index}`
        control.setAttribute('aria-labelledby', label.id)
        if (!control.id && label.htmlFor) control.id = label.htmlFor
      })
    }
    associateLabels()
    const observer = new MutationObserver(associateLabels)
    if (ref.current) observer.observe(ref.current, {childList:true, subtree:true})
    return () => observer.disconnect()
  }, [labelPrefix])
  return <div ref={ref} className="docsbot-openui-surface not-prose" role="group" aria-label="Generated interface" aria-busy={isStreaming} style={{...variables, width:'100%', minWidth:0, margin:'12px 0', color:'var(--openui-text-neutral-primary)', fontSize:14, lineHeight:1.5}}>{children}</div>
}

export default function OpenUIRenderer({ payload, isStreaming = false, onSend, messageId, lifecycleState, onLifecycleState, requestPending = false, readOnly = false, fallbackText }) {
  const { effectiveTheme, color, teamId, botId } = useConfig()
  const mode = effectiveTheme === 'dark' ? 'dark' : 'light'
  const lightTheme = React.useMemo(() => createOpenUITheme(color, 'light'), [color])
  const darkTheme = React.useMemo(() => createOpenUITheme(color, 'dark'), [color])
  const [failedResponse, setFailedResponse] = React.useState(null)
  const preview = isStreaming || payload?.provisional === true
  const safePayload = cleanGenerativeUiPayload(payload, { streaming: preview })
  if (!safePayload) return <p role="status">{fallbackText || "The interface could not be displayed. Please retry your request."}</p>
  if (!preview && failedResponse === safePayload.response) return <p role="status">{fallbackText || "The interface could not be displayed. Please retry your request."}</p>
  const send = async (event, actionGroup) => {
    // Generated UIs can only add an explicit user turn to this conversation.
    // No tool registry, Query, Mutation, arbitrary code, or URL actions are supplied.
    if (readOnly || preview) return false
    if (actionGroup) event = {...event, params:{...event.params, docsbotAction:{group:actionGroup.name, policy:actionGroup.policy}}}
    const message = buildOpenUIActionMessage(event)
    if (!message) return false
    let hostResult
    const proceed = dispatchOpenUIAction({ ...event, actionGroup, teamId, botId, messageId, response: safePayload.response, message, respondWith: value => { hostResult = Promise.resolve(value) } })
    if (!proceed) return hostResult ? await hostResult : 'cancelled'
    return typeof onSend === 'function' ? await onSend(message) : false
  }
  return <ThemeProvider mode={mode} lightTheme={lightTheme} darkTheme={darkTheme} cssSelector=".docsbot-openui-surface"><ThemeSurface isStreaming={preview}><FrozenInterface frozen={readOnly || preview}><OpenUIErrorBoundary fallbackText={fallbackText} key={preview ? 'streaming' : 'complete'} response={safePayload.response}><ActionLifecycleProvider initialState={lifecycleState} onSave={onLifecycleState} send={send} requestPending={requestPending} readOnly={readOnly || preview}>{api => <Renderer onParseResult={result => { if (!preview && (!result?.root || result.meta?.incomplete || result.meta?.unresolved?.length)) setFailedResponse(safePayload.response) }} onError={errors => { if (!preview && errors.length) setFailedResponse(safePayload.response) }} response={safePayload.response} library={library} initialState={lifecycleState?.formState} onStateUpdate={api.onStateUpdate} isStreaming={preview || requestPending} onAction={api.onAction} />}</ActionLifecycleProvider></OpenUIErrorBoundary></FrozenInterface></ThemeSurface></ThemeProvider>
}
