import { test, expect } from '@playwright/test';
import { installWidgetMocks, mockWidgetConfig } from './helpers/widgetMocks.mjs';
const yes='Mit dem Kundenservice Kontakt aufnehmen und Unterstützung erhalten';
const no='Nein, ich möchte zuerst selbst nach einer Lösung suchen';
const error='Der Kundendienst ist derzeit nicht erreichbar. Bitte versuchen Sie es später erneut.';
async function mount(page, width, height, scenario) {
  await page.setViewportSize({width,height});
  const yesLabel = scenario === 'unbroken' ? 'KUNDENSERVICE'.repeat(7) : yes;
  await installWidgetMocks(page,{...mockWidgetConfig,isAgent:true,useEscalation:true,questions:[],...(scenario==='longheader'?{botName:'Kundenservice und technische Produktunterstützung'}:{}),helpdesk:{enabled:scenario!=='byo',mode:'live'}});
  await page.route('https://api.docsbot.ai/teams/**/chat-agent',route=>route.fulfill({contentType:'text/event-stream',body:`event: stream\ndata: Möchten Sie den Support kontaktieren?\n\nevent: support_escalation\ndata: ${JSON.stringify({answer:'Möchten Sie den Support kontaktieren?',options:{yes:yesLabel,no},history:[],id:'response'})}\n\n`}));
  await page.route('https://api.docsbot.ai/teams/**/helpdesk/sessions',route=>route.fulfill({json:{conversationId:'hd_controls',token:'secret'}}));
  await page.route('https://api.docsbot.ai/teams/**/conversations/**/helpdesk**',route=>route.request().url().endsWith('/realtime')?route.fulfill({json:{enabled:false}}):route.request().method()==='POST'?route.fulfill({status:503}):route.fulfill({json:{ticket:null,messages:[]}}));
  await page.route('https://api.docsbot.ai/teams/**/bots/**/support/**',r=>r.fulfill({json:{}}));
  await page.route('https://api.docsbot.ai/teams/**/conversations/**/escalate',route=>route.fulfill({json:{}}));
  const options={isAgent:true,useEscalation:true,labels:{helpdeskError:error},...(scenario==='select'?{leadCollect:{enabled:true,mode:'before_escalation',fields:[{key:'size',label:'Unternehmensgröße',type:'select',required:true,placeholder:'Bitte wählen Sie eine passende Unternehmensgröße aus',options:[{value:'a',label:'Ein besonders langer beschreibender Auswahlwert'}]}]}}:{})};
  await page.route('**/controls-harness',route=>route.fulfill({contentType:'text/html',body:`<html><head><meta charset="utf-8"></head><body style="margin:0"><div id="docsbot-widget-embed" style="width:${width}px;height:${height}px"></div><script src="/chat.js"></script><script>window.called=0;window.ready=DocsBotAI.mount({id:'test/controls',supportCallback:e=>{window.called++;e.preventDefault()},options:${JSON.stringify(options)}});</script></body></html>`}));
  await page.goto('/controls-harness'); await page.evaluate(()=>window.ready);
  const root=page.locator('#docsbot-widget-embed');
  await root.locator('textarea').fill('Ich brauche support'); await root.locator('textarea').press('Enter');
  const primary=root.getByRole('button',{name:yesLabel}),secondary=root.getByRole('button',{name:no});
  await expect(primary).toBeVisible();
  return {root,primary,secondary};
}
async function checkVisible(root, controls) {
  const viewport=await root.locator('.docsbot-chat-message-container').boundingBox();
  for(const control of controls){
    const box=await control.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(viewport.x-1); expect(box.x+box.width).toBeLessThanOrEqual(viewport.x+viewport.width+1);
    expect(box.y).toBeGreaterThanOrEqual(viewport.y-1); expect(box.y+box.height).toBeLessThanOrEqual(viewport.y+viewport.height+1);
    expect(await control.evaluate(el=>el.scrollWidth<=el.clientWidth+1 && el.scrollHeight<=el.clientHeight+1)).toBe(true);
  }
}
for (const width of [320,360,390,460]) {
  test(`long native handoff actions remain visible at ${width}px`,async({page})=>{
    const {root,primary,secondary}=await mount(page,width,width<=360?420:500,'native');
    await primary.click(); await expect(root.getByRole('alert').filter({hasText:error})).toBeVisible();
    await expect.poll(async()=>{const a=await secondary.boundingBox(),v=await root.locator('.docsbot-chat-message-container').boundingBox();return a.y+a.height<=v.y+v.height+1;}).toBe(true);
    await checkVisible(root,[primary,secondary]);
  });
}
test('legacy callback confirmation stays readable and executes at 320px',async({page})=>{
  const {root,primary,secondary}=await mount(page,320,420,'byo');
  await expect.poll(async()=>{const a=await secondary.boundingBox(),v=await root.locator('.docsbot-chat-message-container').boundingBox();return a.y+a.height<=v.y+v.height+1;}).toBe(true);
  await checkVisible(root,[primary,secondary]);
  await primary.click(); await expect.poll(()=>page.evaluate(()=>window.called)).toBe(1);
});
test('long lead select and submit are brought into the viewport',async({page})=>{
  const {root,primary}=await mount(page,320,420,'select'); await primary.click();
  const select=root.getByLabel('Unternehmensgröße'), submit=root.getByRole('button',{name:'Continue'});
  await expect(select).toBeVisible(); await expect.poll(async()=>{const a=await submit.boundingBox(),v=await root.locator('.docsbot-chat-message-container').boundingBox();return a.y+a.height<=v.y+v.height+1;}).toBe(true);
  await checkVisible(root,[select,submit]);
  await expect(select).toHaveAttribute('title','Bitte wählen Sie eine passende Unternehmensgröße aus');
  await select.selectOption('a'); await expect(select).toHaveValue('a'); await expect(select).toHaveAttribute('title','Ein besonders langer beschreibender Auswahlwert');
});

test('long header title does not collide with the reset control',async({page})=>{
  const {root}=await mount(page,320,420,'longheader');
  const title=root.locator('.docsbot-chat-header-title'), reset=root.locator('.docsbot-chat-header-button');
  await expect(title).toBeVisible(); await page.waitForTimeout(400); if(process.env.WIDGET_HEADER_CAPTURE) await root.screenshot({path:process.env.WIDGET_HEADER_CAPTURE}); const b=await reset.boundingBox();
  const rects=await title.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);return [...r.getClientRects()].map(x=>({left:x.left,right:x.right,top:x.top,bottom:x.bottom}));});
  const header=await root.locator('.docsbot-chat-header').boundingBox();
  for(const a of rects) { expect(a.right<=b.x+1 || a.left>=b.x+b.width-1 || a.bottom<=b.y+1 || a.top>=b.y+b.height-1).toBe(true); expect(a.bottom).toBeLessThanOrEqual(header.y+header.height+1); }
});

test('unbroken long confirmation label wraps within its action at 320px',async({page})=>{
  const {root,primary,secondary}=await mount(page,320,420,'unbroken');
  await checkVisible(root,[primary,secondary]);
  const jump=root.getByRole('button',{name:'Scroll to latest messages'});
  if(await jump.isVisible()) {
    const j=await jump.boundingBox();
    for(const button of [primary,secondary]) {const b=await button.boundingBox(); expect(j.x+j.width<=b.x || b.x+b.width<=j.x || j.y+j.height<=b.y || b.y+b.height<=j.y).toBe(true);}
  }
  const child=primary.locator('span[dir="auto"]');
  expect(await child.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);return r.getClientRects().length;})).toBeGreaterThan(1);
  if(process.env.WIDGET_UNBROKEN_CAPTURE) await root.screenshot({path:process.env.WIDGET_UNBROKEN_CAPTURE});
});

for (const voice of [false,true]) {
  test(`legacy composer keeps upload, microphone and ${voice?'voice start':'disabled submit'} usable at 320px`,async({page})=>{
    await page.setViewportSize({width:320,height:420});
    await page.addInitScript(()=>{
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[]})}});
      window.MediaRecorder=class {};
    });
    await installWidgetMocks(page,{...mockWidgetConfig,isAgent:true,useEscalation:true,useImageUpload:true,useAudioUpload:true,useVoiceAgent:voice,helpdesk:{enabled:false,mode:'live'}});
    await page.route('**/composer-harness',route=>route.fulfill({contentType:'text/html',body:`<html><head><meta charset="utf-8"></head><body style="margin:0"><div id="docsbot-widget-embed" style="width:320px;height:420px"></div><script src="/chat.js"></script><script>window.ready=DocsBotAI.mount({id:'test/composer',options:{isAgent:true,useImageUpload:true,useAudioUpload:true,useVoiceAgent:${voice}}});</script></body></html>`}));
    await page.goto('/composer-harness'); await page.evaluate(()=>window.ready);
    const root=page.locator('#docsbot-widget-embed'), image=root.getByRole('button',{name:'Upload image'}), mic=root.getByRole('button',{name:'Record voice message'}), action=root.getByRole('button',{name:voice?'Start voice call':'Submit'}), input=root.locator('textarea');
    await expect(image).toBeVisible(); await expect(mic).toBeVisible(); await expect(action).toBeVisible();
    const boxes=await Promise.all([image.boundingBox(),mic.boundingBox(),action.boundingBox()]);
    if(process.env.WIDGET_COMPOSER_CAPTURE_DIR) await root.screenshot({path:`${process.env.WIDGET_COMPOSER_CAPTURE_DIR}/composer-${voice?'voice':'mic'}-320x420.png`});
    expect(boxes[0].x+boxes[0].width).toBeLessThanOrEqual(boxes[1].x+1);
    if(voice) expect(boxes[1].x+boxes[1].width).toBeLessThanOrEqual(boxes[2].x+1);
    for(const control of [image,mic]) expect(await control.evaluate(el=>{const b=el.getBoundingClientRect(),hit=el.getRootNode().elementFromPoint(b.x+b.width/2,b.y+b.height/2);return hit===el || el.contains(hit);})).toBe(true);
    expect(boxes[2].width).toBeGreaterThanOrEqual(44);
    await input.fill('Hello');
    await expect(mic).toHaveCount(0);
    const send=root.getByRole('button',{name:'Submit'}); await expect(send).toBeEnabled();
    await expect.poll(async()=>{const a=await image.boundingBox(),b=await send.boundingBox();return b.x-(a.x+a.width);}).toBeGreaterThanOrEqual(2);
  });
}
