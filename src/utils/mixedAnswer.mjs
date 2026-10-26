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
const styleValues=new Set(['row','column','small','default','large','large-heavy','small-heavy','primary','secondary','outline','ghost','card','clear','sunk','xs','s','m','l','xl','2xl','start','end','stretch','center','between','around','evenly','once','repeatable','gray'])
export function plainMixedAnswer(source='', {interrupted=false}={}) {
 const blocks=splitMixedAnswer(source,{streaming:interrupted})
 if(!blocks.some(block=>block.kind==='ui'||block.kind==='invalid'||block.kind==='pending'))return source
 return blocks.map(block=>{
  if(block.kind==='markdown')return block.text
  if(block.kind!=='ui')return 'The interface was interrupted. Please retry your request.'
  const program=withoutActions(block.text)
  const values=[...program.matchAll(/"(?:\\.|[^"\\])*"|(?<![\w$])[-+]?\d+(?:\.\d+)?(?!\w)/g)].flatMap(match=>{try{const value=JSON.parse(match[0]);return value!==''&&!styleValues.has(value)?[String(value)]:[]}catch{return []}})
  return [...new Set(values)].join('\n')||'The interface could not be displayed. Please retry your request.'
 }).filter(Boolean).join('\n\n').trim()||'The response could not be displayed. Please retry your request.'
}
