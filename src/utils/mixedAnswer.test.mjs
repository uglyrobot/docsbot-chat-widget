import {strict as assert} from 'node:assert'
import {test} from 'node:test'
import {splitMixedAnswer,plainMixedAnswer} from './mixedAnswer.mjs'
const program='root = Stack([TextContent("Invoice ID-long-101 · Paid · $124.00"), Button("View invoice", @ToAssistant("details", {hidden: "private action context"}))])'
const ui='```openui-lang\n'+program+'\n```\n'
test('UI-only and mixed blocks preserve order; normal Markdown is byte exact',()=>{
 assert.deepEqual(splitMixedAnswer('Before\n'+ui+'Between\n'+ui+'After').map(x=>x.kind),['markdown','ui','markdown','ui','markdown'])
 assert.equal(plainMixedAnswer(' normal **Markdown**\n'),' normal **Markdown**\n')
 const text=plainMixedAnswer(ui)
 for(const value of ['ID-long-101','Paid','$124.00','View invoice'])assert.ok(text.includes(value))
 assert.ok(!text.includes('private action context')&&!text.includes('Stack('))
})
test('every character boundary holds partial fences and preserves all UI bytes',()=>{
 for(let i=1;i<=ui.length;i++){
  const source=ui.slice(0,i),blocks=splitMixedAnswer(source,{streaming:true})
  assert.ok(!blocks.filter(x=>x.kind==='markdown').map(x=>x.text).join('').includes('```openui'))
 }
 assert.equal(splitMixedAnswer(ui)[0].text,program+'\n')
 assert.equal(splitMixedAnswer('```openu',{streaming:true})[0].kind,'pending')
 assert.equal(splitMixedAnswer('```openui-lang\nroot = Stack([TextContent("partial', {streaming:true})[0].complete,false)
})
test('ordinary fenced code, escaped fences and quoted fence strings stay literal',()=>{
 const ordinary='````markdown\n'+ui+'````\n'
 assert.equal(splitMixedAnswer(ordinary)[0].text,ordinary)
 assert.equal(splitMixedAnswer('\\```openui-lang\nExample')[0].kind,'markdown')
 assert.equal(splitMixedAnswer('```openui-lang\nroot = Stack([TextContent("quoted \\" ```")])\n```\n')[0].complete,true)
})
test('cancelled UI is useful retry text, projection strips multiline nested action context',()=>{
 assert.ok(plainMixedAnswer('```openui-lang\nroot = Stack([').includes('retry'))
 const source='```openui-lang\nroot = Stack([TextContent("Visible"),Button("Go",@ToAssistant(\n "hidden", {nested: Other("secret")}))])\n```\n'
 const text=plainMixedAnswer(source);assert.ok(text.includes('Visible')&&text.includes('Go'));assert.ok(!text.includes('secret')&&!text.includes('hidden'))
})

test('unframed image-card follow-up is UI; incomplete root never leaks; explicit code examples stay code',()=>{
 const raw='root = Stack([card])\ncard = Card([CardHeader("Colors"), ImageBlock("https://docsbot.ai/image.png", "Widget appearance"),TextContent("Choose a color")])'
 assert.equal(splitMixedAnswer(raw,{streaming:true})[0].kind,'ui')
 assert.equal(splitMixedAnswer(raw)[0].kind,'ui')
 assert.ok(!plainMixedAnswer(raw).includes('ImageBlock('))
 for(const prefix of ['r','ro','roo','root','root =','root = S','root = Stack'])assert.equal(splitMixedAnswer(prefix,{streaming:true})[0].kind,'pending')
 const example='```text\n'+raw+'\n```'
 assert.equal(splitMixedAnswer(example)[0].kind,'markdown');assert.equal(plainMixedAnswer(example),example)
 assert.equal(splitMixedAnswer('The root = Stack example stays prose.')[0].kind,'markdown')
})
