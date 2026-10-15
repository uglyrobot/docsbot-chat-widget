import React from 'react'
import { Renderer } from '@openuidev/react-lang'
import { library } from './library'
import { cleanGenerativeUiPayload } from '../../utils/generativeUiPayload.mjs'

class OpenUIErrorBoundary extends React.Component {
	constructor(props) {
		super(props)
		this.state = { failed: false }
	}

	static getDerivedStateFromError() {
		return { failed: true }
	}

	render() {
		return this.state.failed ? null : this.props.children
	}
}

export function OpenUIResponse({ payload, isStreaming = false }) {
	const safePayload = cleanGenerativeUiPayload(payload)
	if (!safePayload) return null

	return (
		<div
			className="docsbot-openui-response"
			role="group"
			aria-label="Generated interface"
			aria-busy={isStreaming}
		>
			<OpenUIErrorBoundary>
				<Renderer
					response={safePayload.response}
					library={library}
					isStreaming={isStreaming}
				/>
			</OpenUIErrorBoundary>
		</div>
	)
}
