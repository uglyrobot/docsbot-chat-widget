// Actual widget geometry and screenshots against isolated synthetic API fixtures.
import { chromium } from '@playwright/test';
import { installWidgetMocks, mockWidgetConfig } from '../tests/accessibility/helpers/widgetMocks.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const phase=process.argv[2] || 'before';
const out=`/workspace/docsbot-site/docs/helpdesk-audit/control-check/widget/${phase}`;
const base=process.env.WIDGET_TEST_URL || 'http://127.0.0.1:3005';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const yes='Mit dem Kundenservice Kontakt aufnehmen und Unterstützung erhalten';
const no='Nein, ich möchte zuerst selbst nach einer Lösung suchen';
const file='KUNDENSUPPORTUNTERLAGEN'.repeat(6)+'.pdf';
const records=[];
async function audit(width,height,scenario){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1}); const page=await context.newPage();
 await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await installWidgetMocks(page,{...mockWidgetConfig,botName:'Support',description:'',questions:[],isAgent:true,useEscalation:true,helpdesk:{enabled:scenario!=='byo',mode:'live'}});
 await page.route('https://api.docsbot.ai/teams/**/chat-agent',r=>r.fulfill({status:200,contentType:'text/event-stream',body:`event: stream\ndata: Möchten Sie den Support kontaktieren?\n\nevent: support_escalation\ndata: ${JSON.stringify({answer:'Möchten Sie den Support kontaktieren?',options:{yes,no},history:[],id:'response'})}\n\n`}));
 await page.route('https://api.docsbot.ai/teams/**/helpdesk/sessions',r=>r.fulfill({json:{conversationId:'hd_audit',token:'fake'}}));
 await page.route('https://api.docsbot.ai/teams/**/conversations/**/helpdesk**',r=>{
  if(r.request().url().endsWith('/realtime'))return r.fulfill({json:{enabled:false}});
  if(scenario==='expired')return r.fulfill({status:404});
  if(r.request().method()==='POST')return r.fulfill({status:503});
  const messages=scenario==='files'?[{id:'r1',type:'reply',sender:'agent',text:'',attachments:[{id:'f1',name:file,size:500,mime:'application/pdf'}]}]:[];
  return r.fulfill({json:{ticket:scenario==='files'?{mode:'live',status:'open',aiPaused:true}:null,messages}});
 });
 await page.route('https://api.docsbot.ai/teams/**/bots/**/support/**',r=>r.fulfill({json:{}}));
 await page.route('https://api.docsbot.ai/teams/**/conversations/**/escalate',r=>r.fulfill({json:{}}));
 if(scenario==='files'||scenario==='expired')await page.addInitScript(()=>{localStorage.setItem('DocsBot_stress_conversationId','hd_audit');localStorage.setItem('DocsBot_test_stress_helpdesk',JSON.stringify({conversationId:'hd_audit',token:'fake'}));});
 const labels={helpdeskError:'Der Kundendienst ist derzeit nicht erreichbar. Bitte versuchen Sie es später erneut.',resetChat:'Gespräch zurücksetzen und erneut beginnen'};
 const options={isAgent:true,useEscalation:true,theme:scenario==='files'?'dark':'light',labels,...(scenario==='select'?{leadCollect:{enabled:true,mode:'before_escalation',fields:[{key:'size',label:'Unternehmensgröße',type:'select',required:true,placeholder:'Bitte wählen Sie eine passende Unternehmensgröße aus',options:[{value:'a',label:'Ein besonders langer beschreibender Auswahlwert für dieses Unternehmen'}]}]}}:{})};
 await page.route('**/stress-harness',r=>r.fulfill({contentType:'text/html',body:`<html><head><meta charset="utf-8"></head><body style="margin:0"><div id="docsbot-widget-embed" style="width:${width}px;height:${height}px"></div><script src="/chat.js"></script><script>window.called=0;window.ready=DocsBotAI.mount({id:'test/stress',supportCallback:(e)=>{window.called++;e.preventDefault()},options:${JSON.stringify(options)}});</script></body></html>`}));
 await page.goto(`${base}/stress-harness`);await page.evaluate(()=>window.ready);const root=page.locator('#docsbot-widget-embed');await root.locator('textarea').waitFor();
 if(scenario==='expired'){await root.locator('textarea').fill('Hilfe benötigt');await root.locator('textarea').press('Enter');await root.getByText(labels.helpdeskError).waitFor();}
 else if(scenario==='files'){await root.getByRole('button',{name:file}).waitFor({timeout:15000});}
 else {await root.locator('textarea').fill('Ich brauche support');await root.locator('textarea').press('Enter');await root.getByRole('button',{name:yes}).waitFor(); if(scenario==='failure'){await root.getByRole('button',{name:yes}).click();await root.getByText(labels.helpdeskError).waitFor();} if(scenario==='select'){await root.getByRole('button',{name:yes}).click();await root.getByLabel('Unternehmensgröße').waitFor();}}
 await page.waitForTimeout(200); await root.screenshot({path:`${out}/${scenario}-${width}x${height}.png`});
 const controls=await root.locator('button,select,textarea').evaluateAll(els=>els.map(e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e); if(!b.width||!b.height||s.visibility==='hidden')return null;const p=e.parentElement?.getBoundingClientRect();const text=e.innerText?.trim()||e.getAttribute('aria-label')||e.getAttribute('placeholder')||'';const child=[...e.querySelectorAll('span')].map(x=>{const z=x.getBoundingClientRect();return {w:z.width,h:z.height,text:x.textContent};}); return {tag:e.tagName,text:text.slice(0,240),x:b.x,y:b.y,w:b.width,h:b.height,scrollW:e.scrollWidth,clientW:e.clientWidth,scrollH:e.scrollHeight,clientH:e.clientHeight,parentW:p?.width,children:child};}).filter(Boolean));
 records.push({width,height,scenario,controls});console.log(scenario,width,height,JSON.stringify(controls));if(scenario==='byo'){await root.getByRole('button',{name:yes}).click();await page.waitForFunction(()=>window.called===1,null,{timeout:5000});}await context.close();
}
try{for(const [width,height] of [[320,420],[360,420],[390,500],[460,560]])for(const scenario of ['byo','failure','expired','files','select'])await audit(width,height,scenario);await writeFile(`${out}/measurements.json`,JSON.stringify({fixture:'Synthetic data, mocked APIs, no production calls',records},null,2));}finally{await browser.close();}
