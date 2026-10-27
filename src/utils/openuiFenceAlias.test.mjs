import {strict as assert} from 'node:assert'
import test from 'node:test'
import {splitMixedAnswer,plainMixedAnswer} from './mixedAnswer.mjs'
const code='root = Stack([TextContent("Beloved initiative"),Button("More",@ToAssistant("Continue",{secret:"PRIVATE"}))])'
const fenced=(lang,body=code)=>'```'+lang+'\n'+body+'\n```\n'
for(const language of ['openui','openui-lang'])test(language+' fences stream, render and project through the same contract',()=>{
 const source='Before\n'+fenced(language)+'Between\n'+fenced(language)+'After'
 assert.deepEqual(splitMixedAnswer(source).map(b=>b.kind),['markdown','ui','markdown','ui','markdown'])
 assert.equal(splitMixedAnswer(fenced(language))[0].text,code+'\n')
 const plain=plainMixedAnswer(source);assert.ok(plain.includes('Beloved initiative')&&plain.includes('After'));assert.ok(!plain.includes('PRIVATE')&&!plain.includes('Stack('))
 for(let n=1;n<=fenced(language).length;n++){
  const blocks=splitMixedAnswer(fenced(language).slice(0,n),{streaming:true})
  assert.ok(!blocks.filter(b=>b.kind==='markdown').map(b=>b.text).join('').includes('```openui'))
 }
 assert.equal(splitMixedAnswer('```'+language+'\n'+code)[0].kind,'invalid')
 assert.equal(splitMixedAnswer('```'+language+'\n'+code,{streaming:true})[0].complete,false)
})
test('intentional examples, escaped markers, unknown labels and malformed closes stay bounded',()=>{
 for(const source of ['````markdown\n'+fenced('openui')+'````\n',fenced('text',code),fenced('openui-example'),fenced('OPENUI'),'\\```openui\nexample']){
  assert.deepEqual(splitMixedAnswer(source),[{kind:'markdown',text:source,complete:true}]);assert.equal(plainMixedAnswer(source),source)
 }
 for(const end of ['``','```bad','~~~'])assert.equal(splitMixedAnswer('```openui\n'+code+'\n'+end)[0].kind,'invalid')
 const quoted=fenced('openui','root = Stack([TextContent("literal \\" ```openui")])');assert.equal(splitMixedAnswer(quoted)[0].complete,true)
})
