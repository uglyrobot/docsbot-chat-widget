import {defaultLabels} from '../constants/defaultLabels.mjs'
// Upstream inline syntax; ordinary fences stay ordinary Markdown.
export function splitMixedAnswer(source = '', {streaming = false} = {}) {
  if (typeof source !== 'string') return []
  const trimmed=source.trimStart()
  // A model can omit the fence. Recover only a leading program, not prose/examples.
  if(/^root\s*=\s*Stack\s*\(/.test(trimmed))return [{kind:'ui',text:trimmed,complete:!streaming}]
  if(streaming&&trimmed&&('root'.startsWith(trimmed)||/^root\s*(?:=\s*(?:S|St|Sta|Stac|Stack)?\s*)?$/.test(trimmed)))return [{kind:'pending',text:'',complete:false}]
  const result=[]; let prose='',body='',marker=null,ui=false,quote=false,escaped=false
  const flush=()=>{if(prose){result.push({kind:'markdown',text:prose,complete:true});prose=''}}
  const lines=source.match(/[^\n]*\n|[^\n]+$/g)||[]
  for(let index=0;index<lines.length;index++){
    const line=lines[index],bare=line.replace(/[\r\n]+$/,''),match=/^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(bare)
    if(marker===null){
      if(match){const [,mark,lang]=match
        if(lang.trim()==='openui-lang'){flush();marker=mark;ui=true;body='';quote=false;escaped=false}
        else if(streaming&&index===lines.length-1&&!/[\r\n]$/.test(line)&&'openui-lang'.startsWith(lang.trim())){flush();result.push({kind:'pending',text:'',complete:false})}
        else{marker=mark;ui=false;prose+=line}
      }else if(streaming&&index===lines.length-1&&/^ {0,3}`{1,2}$/.test(bare)){flush();result.push({kind:'pending',text:'',complete:false})}
      else prose+=line
      continue
    }
    const closes=match&&!match[2].trim()&&match[1][0]===marker[0]&&match[1].length>=marker.length
    if(closes&&(!ui||!quote)){
      if(ui)result.push({kind:'ui',text:body,complete:true});else prose+=line
      marker=null;ui=false;continue
    }
    if(ui){body+=line;for(const char of line){if(escaped)escaped=false;else if(char==='\\'&&quote)escaped=true;else if(char==='"')quote=!quote}}
    else prose+=line
  }
  if(marker&&ui)result.push({kind:streaming?'ui':'invalid',text:body,complete:false})
  flush();return result
}
export const hasMixedUi = text => splitMixedAnswer(text,{streaming:true}).some(block=>block.kind==='ui'||block.kind==='pending')
function withoutActions(program) {
 let out='',i=0
 while(i<program.length){
  if(program.startsWith('@ToAssistant',i)){
   const start=program.indexOf('(',i);if(start<0)break
   i=start+1;let depth=1,quoted=false,escaped=false
   while(i<program.length&&depth){const c=program[i++]
    if(escaped)escaped=false
    else if(c==='\\'&&quoted)escaped=true
    else if(c==='"')quoted=!quoted
    else if(!quoted&&c==='(')depth++
    else if(!quoted&&c===')')depth--
   }
  }else if(program[i]==='"'){
   const start=i++
   while(i<program.length){if(program[i]==='\\'){i+=2;continue}if(program[i++]==='"')break}
   out+=program.slice(start,i)
  }else out+=program[i++]
 }
 return out
}
// Only direct presentation arguments are omitted. Content in arrays/objects
// and strings such as TextContent("small") must survive unchanged.
// Traverse static declarations reachable from the displayed root only.
// Action expressions were removed first; their context bindings stay private.
function projectionParts(value,separator=','){
 const parts=[];let start=0,depth=0,quoted=false,escaped=false
 for(let i=0;i<value.length;i++){const c=value[i]
  if(escaped){escaped=false;continue}if(c==='\\'&&quoted){escaped=true;continue}if(c==='"'){quoted=!quoted;continue}if(quoted)continue
  if('([{'.includes(c))depth++;else if(')]}'.includes(c))depth--
  else if(c===separator&&depth===0){parts.push(value.slice(start,i).trim());start=i+1}
 }
 parts.push(value.slice(start).trim());return parts.filter(Boolean)
}
function displayExpression(program){
 const masked=program.replace(/"(?:\\.|[^"\\])*"/g,m=>' '.repeat(m.length))
 const matches=[...masked.matchAll(/(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*=/g)]
 const definitions=new Map(matches.map((m,i)=>[m[1],program.slice(m.index+m[0].length,matches[i+1]?.index??program.length)]))
 let budget=64000
 const select=(expression,path,active)=>{
  budget-=expression.length;if(budget<0||active.size>64)throw new Error('Projection limit')
  expression=expression.trim();if(!path.length)return expression
  if(definitions.has(expression)&&!active.has(expression))return select(definitions.get(expression),path,new Set([...active,expression]))
  if(expression.startsWith('[')&&expression.endsWith(']'))return '['+projectionParts(expression.slice(1,-1)).map(item=>select(item,path,active)).join(',')+']'
  if(expression.startsWith('{')&&expression.endsWith('}')){
   for(const part of projectionParts(expression.slice(1,-1))){const pair=projectionParts(part,':');let key=pair.shift();if(key?.startsWith('"'))key=JSON.parse(key);if(key===path[0])return select(pair.join(':'),path.slice(1),active)}
  }
  throw new Error('Unsupported display selector')
 }
 const expand=(expression,active=new Set())=>{
  budget-=expression.length;if(budget<0||active.size>64)throw new Error('Projection limit')
  return expression.replace(/"(?:\\.|[^"\\])*"|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g,(token,offset)=>{
   if(expression.slice(offset+token.length).trimStart().startsWith(':'))return token
   const [name,...path]=token.split('.')
   if(!definitions.has(name)||active.has(name))return token
   if(/^[\[.(]/.test(expression.slice(offset+token.length).trimStart()))throw new Error('Unsupported display selector')
   const next=new Set([...active,name]);return expand(select(definitions.get(name),path,next),next)
  })
 }
 try{return definitions.has('root')?expand(definitions.get('root'),new Set(['root'])):''}catch{return ''}
}
const presentationArgs={Stack:[1,2,3,4,5],Card:[1,2,3,4,5,6],TextContent:[1],MarkDownRenderer:[1],Callout:[0],TextCallout:[0],Col:[2],Button:[2,3,4],Buttons:[1],Separator:[0],TagBlock:[1],Tag:[2,3],EntityList:[1],ListBlock:[1,2],Text:[0,3,4],BoldText:[0,3,4],IconText:[1,2,6],ImageText:[5],Carousel:[1],ActionGroup:[1]}
export function projectUiContent(program){
 program=displayExpression(program)
 const frames=[],values=[]
 const tokens=program.matchAll(/"(?:\\.|[^"\\])*"|[A-Za-z_$][\w$]*|[-+]?\d+(?:\.\d+)?|[()[\]{},]/g)
 let previous=''
 for(const match of tokens){const token=match[0],top=frames.at(-1)
  if(token==='('||token==='['||token==='{')frames.push({kind:token,name:token==='('?previous:'',arg:0})
  else if(token===')'||token===']'||token==='}')frames.pop()
  else if(token===','){if(top)top.arg++}
  else if(token.startsWith('"')||/^[-+]?\d/.test(token)||token==='true'||token==='false'){
   if(!(top?.kind==='('&&presentationArgs[top.name]?.includes(top.arg))){
    try{const value=JSON.parse(token);if(value!=='')values.push(String(value))}catch{}
   }
  }
  previous=token
 }
 return values.join('\n')
}
export function plainMixedAnswer(source='', {interrupted=false,labels=defaultLabels}={}) {
 const blocks=splitMixedAnswer(source,{streaming:interrupted})
 if(!blocks.some(block=>block.kind==='ui'||block.kind==='invalid'||block.kind==='pending'))return source
 return blocks.map(block=>{
  if(block.kind==='markdown')return block.text
  if(block.kind!=='ui')return labels.uiInterrupted
  const program=withoutActions(block.text)
  return projectUiContent(program)||labels.uiUnavailable
 }).filter(Boolean).join('\n\n').trim()||labels.uiUnavailable
}
