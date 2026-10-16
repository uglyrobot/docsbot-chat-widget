import React, { useLayoutEffect, useRef } from 'react'
import { Renderer } from '@openuidev/react-lang'
import { ThemeProvider, useTheme } from '@openuidev/react-ui'
import { library } from './library'
import { createOpenUITheme } from './theme.mjs'
import surfaceStyles from '!raw-loader!./surface.css'
import { cleanGenerativeUiPayload } from '../../utils/generativeUiPayload.mjs'
import openuiStyles from '!raw-loader!@openuidev/react-ui/styles/index.css'
import { useConfig } from '../configContext/ConfigContext'

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

export default function OpenUIRenderer({ payload, isStreaming = false, onSend }) {
  const { effectiveTheme, color } = useConfig()
  const mode = effectiveTheme === 'dark' ? 'dark' : 'light'
  const lightTheme = React.useMemo(() => createOpenUITheme(color, 'light'), [color])
  const darkTheme = React.useMemo(() => createOpenUITheme(color, 'dark'), [color])
  const safePayload = cleanGenerativeUiPayload(payload)
  if (!safePayload) return null
  const onAction = event => {
    // Generated UIs can only add an explicit user turn to this conversation.
    // No tool registry, Query, Mutation, arbitrary code, or URL actions are supplied.
    if (isStreaming || event.type !== 'continue_conversation' || typeof onSend !== 'function') return
    const label = String(event.humanFriendlyMessage || 'Form submitted').slice(0,1000)
    const values = event.formState ? JSON.stringify(event.formState) : ''
    if (values.length > 10000) return
    onSend(values ? label + '\nForm values: ' + values : label)
  }
  return <ThemeProvider mode={mode} lightTheme={lightTheme} darkTheme={darkTheme} cssSelector=".docsbot-openui-surface"><ThemeSurface isStreaming={isStreaming}><OpenUIErrorBoundary response={safePayload.response}><Renderer response={safePayload.response} library={library} isStreaming={isStreaming} onAction={onAction} /></OpenUIErrorBoundary></ThemeSurface></ThemeProvider>
}
