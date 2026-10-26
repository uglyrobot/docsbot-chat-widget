import React from 'react'
import {splitMixedAnswer,plainMixedAnswer} from '../../utils/mixedAnswer.mjs'
import {manifest} from './contract.mjs'
import {cleanGenerativeUiPayload} from '../../utils/generativeUiPayload.mjs'
import {OpenUIResponse} from './OpenUIResponse'

export default function MixedAnswer({content='',isStreaming=false,renderMarkdown,onSend,readOnly=false,lifecycleState,onLifecycleState,requestPending=false,messageId,enabled=true}){
 if(!enabled)return renderMarkdown(content)
 if(typeof content!=='string'||content.length>64000)return <p role="status">This response could not be displayed. Please retry your request.</p>
 return splitMixedAnswer(content,{streaming:isStreaming}).map((block,index)=>{
  if(block.kind==='markdown')return <React.Fragment key={index}>{renderMarkdown(block.text)}</React.Fragment>
  if(block.kind==='pending')return <span role="status" key={index}>Preparing interface…</span>
  const payload={response:block.text,libraryVersion:manifest.componentLibraryVersion,specSha256:manifest.specSha256}
  const safe=block.kind==='ui'&&cleanGenerativeUiPayload(payload,{streaming:isStreaming})
  if(!safe)return isStreaming ? <span role="status" key={index}>Preparing interface…</span> : <p role="status" key={index}>The interface could not be displayed. Please retry your request.</p>
  return <OpenUIResponse messageId={messageId} key={index} payload={safe} fallbackText={plainMixedAnswer('```openui-lang\n'+block.text+'\n```')} isStreaming={isStreaming} readOnly={readOnly} onSend={onSend} requestPending={requestPending} lifecycleState={lifecycleState?.blocks?.[index]} onLifecycleState={value=>onLifecycleState?.({...lifecycleState,blocks:{...lifecycleState?.blocks,[index]:value}})} />
 })
}
