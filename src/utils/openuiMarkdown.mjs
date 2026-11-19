import {fromMarkdown} from 'mdast-util-from-markdown'

// Reserve the explicit OpenUI language names and delimited variants. Do not
// treat a regular code sample that happens to mention OpenUI as an interface.
const isOpenUiLanguage = lang =>
 typeof lang === 'string' && /^openui(?:-lang)?(?:$|[\s:./#_+\[({])/i.test(lang)

function visitCode(parent, visit) {
 parent.children?.forEach((node, index) => {
  if (node.type === 'code' && isOpenUiLanguage(node.lang)) visit(node, parent, index)
  else visitCode(node, visit)
 })
}

// Applied at the Markdown renderer boundary, after Streamdown parses nested
// blocks and before it creates code, copy, or download controls.
export function remarkHideOpenUiCode({label}) {
 return tree => visitCode(tree, (_node, parent, index) => {
  parent.children[index] = {
   type: 'paragraph',
   children: [{type: 'text', value: label}]
  }
 })
}

// Clipboard / interrupted restore use Markdown, not a rendered AST. Keep the
// original prose/formatting byte-for-byte outside the unhandled code blocks.
export function redactOpenUiMarkdown(source, label) {
 if (typeof source !== 'string' || !/[`~]/.test(source)) return source
 const ranges = []
 visitCode(fromMarkdown(source), ({position}) => ranges.push([position.start.offset, position.end.offset]))
 for (const [start, end] of ranges.reverse()) source = source.slice(0, start) + label + source.slice(end)
 return source
}
