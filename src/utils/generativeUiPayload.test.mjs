import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanGenerativeUiPayload } from './generativeUiPayload.mjs'

const payload = (response) => ({
	response,
	libraryVersion: '1.0.0',
	specSha256: 'ba70f60f9bd97423254845af800e777292a62abce5256cf9f3c48ca4275f5311'
})

test('accepts the pinned display-only library and trims the response', () => {
	const cleaned = cleanGenerativeUiPayload(
		payload('  root = Stack([heading])\nheading = TextBlock("Status", true)  ')
	)
	assert.equal(cleaned.response.startsWith('root = Stack('), true)
})

test('rejects malformed, unpinned, action-capable, and oversized payloads', () => {
	for (const value of [
		payload('not a root'),
		payload('root = Stack([button])\nbutton = Button("go", @submit())'),
		payload('root = Stack([x])\nx = Unknown("unsafe")'),
		payload('root = Stack([])\nvalue = TextBlock("<script>")'),
		{ ...payload('root = Stack([])'), specSha256: '0'.repeat(64) },
		payload(`root = Stack([])\n${'x'.repeat(16001)}`)
	]) {
		assert.equal(cleanGenerativeUiPayload(value), null)
	}
})
