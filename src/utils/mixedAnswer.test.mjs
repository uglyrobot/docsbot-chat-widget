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
test('projection preserves content equal to style values and localizes fallback overrides',()=>{
 assert.equal(plainMixedAnswer('```openui-lang\nroot = Stack([TextContent("small","large"),Table([Col("Size",["small","large","small"])])],"row","m")\n```'),'small\nSize\nsmall\nlarge\nsmall');
 assert.equal(plainMixedAnswer('```openui-lang\nroot = Stack([', {labels:{uiInterrupted:'Interrompu'}}),'Interrompu');
});
test('projection excludes referenced action context and preserves boolean cells',()=>{
 const source='```openui-lang\nroot = Stack([heading,heading,button,Table([Col("Enabled",[true,false])])])\nheading = TextContent("Visible")\nbutton = Button("Continue", @ToAssistant("Send", context))\ncontext = {privateNote:"hidden context"}\n```';
 assert.equal(plainMixedAnswer(source),'Visible\nVisible\nContinue\nEnabled\ntrue\nfalse');
});
test('member selection and array plucking exclude unrelated private fields',()=>{
 const source='```openui-lang\nroot = Stack([Table([Col("Plan", data.rows.name),Col("Price",data.prices)])])\ndata = {rows:[{name:"Basic",internalNote:"PRIVATE"},{name:"Pro",internalNote:"PRIVATE2"}],prices:[10,20]}\n```';
 assert.equal(plainMixedAnswer(source),'Plan\nBasic\nPro\nPrice\n10\n20');
});

test('shared table columns project within the UI limit without repeating sibling work',()=>{
 const columns=Array.from({length:8},(_,i)=>'column'+i)
 const data=Object.fromEntries(columns.map((c,i)=>[c,Array.from({length:25},(_,j)=>`value-${i}-${j}-`+'x'.repeat(28))]))
 data.hidden='PRIVATE'
 const program='root = Stack([Table(['+columns.map(c=>`Col("${c}", data.${c})`).join(',')+'])])\ndata = '+JSON.stringify(data)
 assert.ok(new TextEncoder().encode(program).length<16000)
 const result=plainMixedAnswer('```openui-lang\n'+program+'\n```')
 assert.deepEqual(result.split('\n'),columns.flatMap(c=>[c,...data[c]]))
 assert.ok(!result.includes(data.hidden))
})
test('projection keeps depth and selected-output limits',()=>{
 const repeated='root = Stack(['+Array(100).fill('large').join(',')+'])\nlarge = TextContent('+JSON.stringify('x'.repeat(1000))+')'
 const deep='root = Stack([Table([Col("Value", data.x)])])\ndata = '+'['.repeat(80)+'{x:"PRIVATE"}'+']'.repeat(80)
 for(const program of [repeated,deep]){
  const result=plainMixedAnswer('Before\n```openui-lang\n'+program+'\n```\nAfter')
  assert.ok(result.includes('Before')&&result.includes('After'))
  assert.ok(!result.includes('PRIVATE')&&result.length<1000)
 }
})
