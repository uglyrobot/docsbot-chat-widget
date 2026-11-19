import assert from 'node:assert/strict'
import test from 'node:test'
import {fromMarkdown} from 'mdast-util-from-markdown'
import {redactOpenUiMarkdown, remarkHideOpenUiCode} from './openuiMarkdown.mjs'
import {plainMixedAnswer} from './mixedAnswer.mjs'

const fallback = 'Interface unavailable'
const labels = {uiUnavailable: fallback, uiInterrupted: 'Interface interrupted'}
const raw = 'root = Stack([PRIVATE_OPENUI_SOURCE])'
const fence = (info, body = raw, marker = '```') => [marker + info, body, marker].join('\n')

for (const [name, block] of [
 ['metadata', fence('openui-lang title="example"')],
 ['upper-case', fence('OPENUI')],
 ['suffix', fence('openui-lang:generated')],
 ['blockquote', fence('openui meta').split('\n').map(line => '> ' + line).join('\n')],
 ['list', '- ' + fence('openui-lang').split('\n').join('\n  ')],
 ['tilde', fence('openui generated', raw, '~~~')],
 ['truncated', '```openui-lang generated\n' + raw],
]) test('hides unhandled OpenUI: ' + name, () => {
 const source = 'Before\n\n' + block + (name === 'truncated' ? '' : '\n\nAfter')
 const rendered = fromMarkdown(source)
 remarkHideOpenUiCode({label: fallback})(rendered)
 assert.ok(!JSON.stringify(rendered).includes('PRIVATE_OPENUI_SOURCE'))
 assert.ok(JSON.stringify(rendered).includes(fallback))
 for (const safe of [redactOpenUiMarkdown(source, fallback), plainMixedAnswer(source, {labels})]) {
  assert.ok(safe.includes('Before') && safe.includes(fallback))
  assert.ok(!safe.includes('PRIVATE_OPENUI_SOURCE'))
  if (name !== 'truncated') assert.ok(safe.includes('After'))
 }
})

test('preserves ordinary fences, longer example fences, and prose exactly', () => {
 const source = ['I mentioned OpenUI.', fence('js', raw), fence('openui-example'), fence('markdown', fence('openui'), '````'), '\\```openui'].join('\n\n')
 assert.equal(redactOpenUiMarkdown(source, fallback), source)
 assert.equal(plainMixedAnswer(source, {labels}), source)
 const tree = fromMarkdown(source)
 const unchanged = structuredClone(tree)
 remarkHideOpenUiCode({label: fallback})(tree)
 assert.deepEqual(tree, unchanged)
})

test('only rewrites unrendered fenced blocks; projects actual canonical UI for copy', () => {
 const answer = fence('openui-lang', 'root = Stack([TextContent("Visible content")])') + '\n\n' + fence('openui info')
 const safe = plainMixedAnswer(answer, {labels})
 assert.match(safe, /Visible content/)
 assert.match(safe, /Interface unavailable/)
 assert.doesNotMatch(safe, /Stack\(|PRIVATE_OPENUI_SOURCE/)
})
