// Reproducible UI review fixtures: only localhost and explicitly mocked APIs are used.
import { chromium } from '@playwright/test';
import { installWidgetMocks, mockWidgetConfig } from '../tests/accessibility/helpers/widgetMocks.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const output = process.argv[2] || '/workspace/docsbot-site/docs/helpdesk-audit/pdf';
const base = process.env.WIDGET_TEST_URL || 'http://127.0.0.1:3005';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const manifest=[];
async function make(mode, opts={}) {
 const width=opts.width || 460, height=opts.height || 730;
 const context=await browser.newContext({viewport:{width:Math.max(width+40,400),height:height+40},deviceScaleFactor:1});
 const page=await context.newPage();
 await page.route('**/*', route=>{const url=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();});
 await installWidgetMocks(page,{...mockWidgetConfig,botName:'Acme Support',description:'Ask a question or contact our support team.',labels:{firstMessage:'Hi! How can I help you today?'},isAgent:true,useEscalation:true,questions:[],helpdesk:{enabled:true,mode}});
 let ticket=null,messages=[];
 await page.route('https://api.docsbot.ai/teams/**/helpdesk/sessions',r=>r.fulfill({json:{conversationId:'hd_audit',token:'[REDACTED_SECRET]'}}));
 await page.route('https://api.docsbot.ai/teams/**/conversations/**/helpdesk**',route=>{
   if(route.request().url().endsWith('/realtime'))return route.fulfill({json:{enabled:false}});
   if(opts.expired)return route.fulfill({status:404,json:{error:'expired'}});
   if(route.request().url().endsWith('/messages'))return route.fulfill({json:{message:{id:'visitor-msg',sender:'visitor',type:'reply',text:route.request().postDataJSON().text}}});
   if(route.request().method()==='POST'){if(opts.failEscalation)return route.fulfill({status:503,json:{error:'unavailable'}});ticket={mode,status:'open',aiPaused:true};}
   return route.fulfill({json:{ticket,messages}});
 });
 await page.route('**/widget-capture',r=>r.fulfill({contentType:'text/html',body:`<html><head><style>body{margin:0;background:#eef2f7;display:flex;align-items:center;justify-content:center;min-height:100vh}.shell{width:${width}px;height:${height}px;background:white;border-radius:16px;overflow:hidden}#docsbot-widget-embed{height:100%}</style></head><body><div class="shell"><div id="docsbot-widget-embed"></div></div><script src="/chat.js"></script><script>window.ready=DocsBotAI.mount({id:'audit/demo',options:{isAgent:true,theme:'${opts.dark?'dark':'light'}'}});</script></body></html>`}));
 if(opts.expired)await page.addInitScript(()=>{localStorage.setItem('DocsBot_demo_conversationId','hd_audit');localStorage.setItem('DocsBot_audit_demo_helpdesk',JSON.stringify({conversationId:'hd_audit',token:'[REDACTED_SECRET]'}));});
 await page.goto(`${base}/widget-capture`);await page.evaluate(()=>window.ready);
 const root=page.locator('#docsbot-widget-embed');await root.locator('textarea').waitFor();
 return {context,page,root,setMessages(v){messages=v},setTicket(v){ticket=v}};
}
async function shot(env,name,title,state){await env.page.waitForTimeout(300);await env.page.locator('.shell').screenshot({path:`${output}/widget-${name}.png`});manifest.push({file:`widget-${name}.png`,title,state,fixture:'Synthetic browser fixture; API responses are mocked; no real customer data.'});console.log(name);}
async function requestSupport(e){await e.root.locator('textarea').fill('I need support with my account');await e.root.locator('textarea').press('Enter');await e.root.getByRole('button',{name:'Contact support'}).waitFor();}
async function addFiles(e,long=false){e.setMessages([{id:'r1',type:'reply',sender:'agent',authorName:'Maya',text:'Hi! I can help with your account. I have attached the next steps.',createdAt:new Date().toISOString(),attachments:[{id:'file-1',name:long?'Account-resolution-and-support-instructions-for-your-team-2026-final-version.pdf':'Account-next-steps.pdf',size:23456,mime:'application/pdf'}]},{id:'r2',type:'reply',sender:'agent',text:'',createdAt:new Date().toISOString(),attachments:[{id:'file-2',name:'Getting-started.txt',size:800,mime:'text/plain'}]}]);await e.root.getByRole('button',{name:long?/Account-resolution/:/Account-next-steps/}).waitFor({timeout:15000});}
try {
 const live=await make('live');await shot(live,'baseline','Website chat ready','Visitor opens the embedded chat.');await requestSupport(live);await shot(live,'confirmation','Support escalation confirmation','Assistant offers to connect the visitor with support.');await live.root.getByRole('button',{name:'Contact support'}).click();await live.root.getByText('Waiting for a support agent…').waitFor();await shot(live,'live-waiting','Live handoff waiting','Visitor confirms the handoff.');await addFiles(live);await shot(live,'operator-reply','Operator reply and attachments','Public operator reply includes a file and an attachment-only reply.');live.setTicket({mode:'live',status:'resolved',aiPaused:false});await live.root.locator('textarea').fill('Thank you. What else can you help me with?');await live.root.locator('textarea').press('Enter');await live.root.getByText('Here is a mocked answer with a source.').waitFor();await shot(live,'ai-resumed','AI assistant resumes','Next visitor message returns to the assistant.');await live.context.close();
 const ticket=await make('ticket');await requestSupport(ticket);await ticket.root.getByRole('button',{name:'Contact support'}).click();await ticket.root.getByText('Your request has been sent to support.').waitFor();await shot(ticket,'ticket-submitted','Ticket submitted','Visitor submits a support request.');await ticket.context.close();
 const fail=await make('live',{failEscalation:true});await requestSupport(fail);await fail.root.getByRole('button',{name:'Contact support'}).click();await fail.root.getByText('Could not reach support. Please try again.').waitFor();await shot(fail,'retry','Support connection failure','Handoff error keeps retry available.');await fail.context.close();
 const expired=await make('live',{expired:true});await expired.root.locator('textarea').fill('I need help');await expired.root.locator('textarea').press('Enter');await expired.root.getByText('Could not reach support. Please try again.').waitFor();await shot(expired,'expired','Expired session recovery','Expired session offers reset.');await expired.context.close();
 for(const [name,opts] of [['mobile-320',{width:320,height:700}],['mobile-390',{width:390,height:700}],['dark-long-filename',{width:360,height:700,dark:true}]]){const e=await make('live',opts);await requestSupport(e);await e.root.getByRole('button',{name:'Contact support'}).click();await e.root.getByText('Waiting for a support agent…').waitFor();if(opts.dark)await addFiles(e,true);await shot(e,name,`QA: ${name}`,'Narrow or dark theme layout check.');await e.context.close();}
 const narrowFail=await make('live',{width:320,height:700,failEscalation:true});await requestSupport(narrowFail);await narrowFail.root.getByRole('button',{name:'Contact support'}).click();await narrowFail.root.getByText('Could not reach support. Please try again.').waitFor();await shot(narrowFail,'mobile-320-retry','QA: narrow retry','Support error at a 320 pixel widget width.');await narrowFail.context.close();
 const narrowExpired=await make('live',{width:320,height:700,expired:true});await narrowExpired.root.locator('textarea').fill('I need help');await narrowExpired.root.locator('textarea').press('Enter');await narrowExpired.root.getByText('Could not reach support. Please try again.').waitFor();await shot(narrowExpired,'mobile-320-expired','QA: narrow expired session','Expired session recovery at a 320 pixel widget width.');await narrowExpired.context.close();
 const narrowConfirm=await make('live',{width:320,height:700});await requestSupport(narrowConfirm);await shot(narrowConfirm,'mobile-320-confirmation','QA: narrow confirmation','Escalation confirmation at a 320 pixel widget width.');await narrowConfirm.context.close();
 await writeFile(`${output}/widget-manifest.json`,JSON.stringify({disclaimer:'Actual rendered widget screenshots captured with synthetic fixtures and mocked network responses; not live customer data or a deployed end-to-end test.',screenshots:manifest},null,2));
} finally {await browser.close();}
