import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanGenerativeUiPayload } from './generativeUiPayload.mjs'
import { manifest } from '../components/generativeUi/contract.mjs'

const payload = (response) => ({
	response,
	libraryVersion: '2.0.0',
	specSha256: '5b3fbf97b97a798a82d1a1c3e7b10bb1eca39936d0fc5a9c97aa08811248f073'
})

test('accepts the pinned display-only library and trims the response', () => {
	const cleaned = cleanGenerativeUiPayload(
		payload('  root = Stack([heading])\nheading = TextContent("Status", "large-heavy")  ')
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

test('official forms accept email data and conversation actions but reject remote functions', () => {
	const value = response => ({ response, libraryVersion: manifest.componentLibraryVersion, specSha256: manifest.specSha256 })
	assert.ok(cleanGenerativeUiPayload(value('root = Stack([Form("demo", Buttons([Button("Save", @ToAssistant("Save"))]), [FormControl("Email", Input("email", "demo@example.invalid", "email"))])])')))
	for (const action of ['@Fetch("https://example.invalid")', '@Run("delete")', '@OpenUrl("https://example.invalid")']) {
		assert.equal(cleanGenerativeUiPayload(value(`root = Stack([Button("Run", ${action})])`)), null)
	}
})
