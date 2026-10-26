import React, {forwardRef} from 'react';

// A response owns one copy/actions footer, but only text segments own bubbles.
// These constraints are identical for the first partial frame and the final one.
export const AssistantResponseFrame = forwardRef(function AssistantResponseFrame({children,style,...props},ref) {
 return <div {...props} ref={ref} data-docsbot-response-frame="" style={{...style,width:'100%',maxWidth:'none',minWidth:0,alignSelf:'stretch',padding:0,background:'transparent',borderRadius:0,overflow:'visible',boxSizing:'border-box'}}>{children}</div>;
});

export function AssistantTextBubble({children}) {
 return <div className="docsbot-chat-bot-message docsbot-chat-text-segment bg-slate-100 text-slate-800">{children}</div>;
}
