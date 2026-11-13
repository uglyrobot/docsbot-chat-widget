import { test, expect } from '@playwright/test';
import { installWidgetMocks, mockWidgetConfig } from './helpers/widgetMocks.mjs';

for (const mode of ['live', 'ticket']) test(`protected ${mode} escalation routes messages, retries, reloads and resumes AI`, async ({page}) => {
  const config = {...mockWidgetConfig, isAgent:true, useVoiceAgent:true, useEscalation:true, helpdesk:{enabled:true, mode}};
  await installWidgetMocks(page, config);
  let ticket = null, sessions = 0, aiRequests = 0, sends = 0, failedId = null;
  const messages = [];
  await page.route('https://api.docsbot.ai/teams/**/helpdesk/sessions', async route => {
    sessions++;
    await route.fulfill({json:{conversationId:'hd_server-conversation',token:'visitor-secret'}});
  });
  await page.route('https://api.docsbot.ai/teams/**/conversations/**/helpdesk**', async route => {
    expect(route.request().headers()['x-helpdesk-token']).toBe('visitor-secret');
    if (route.request().url().endsWith('/realtime')) return route.fulfill({json:{enabled:false}});
    if (route.request().url().endsWith('/messages')) {
      const body = route.request().postDataJSON(); sends++;
      if (sends === 1) { failedId = body.clientMessageId; await route.fulfill({status:503}); return; }
      expect(body.clientMessageId).toBe(failedId);
      await route.fulfill({json:{message:{id:body.clientMessageId,type:'reply',sender:'visitor',text:body.text}}}); return;
    }
    if (route.request().method() === 'GET') expect(route.request().headers()['cache-control']).toBe('no-store');
    if (route.request().method() === 'POST') { expect(route.request().postDataJSON().mode).toBe(mode); ticket = {mode,status:'open',aiPaused:true}; }
    await route.fulfill({json:{ticket,messages}});
  });
  await page.route('https://api.docsbot.ai/teams/**/chat-agent', async route => {
    aiRequests++;
    expect(route.request().headers()['x-helpdesk-token']).toBe('visitor-secret');
    expect(route.request().postDataJSON().conversationId).toBe('hd_server-conversation');
    await route.fallback();
  });
  await page.route('**/helpdesk-harness', route => route.fulfill({contentType:'text/html',body:`<html><body><div id="docsbot-widget-embed" style="height:650px"></div><script src="/chat.js"></script><script>window.ready = DocsBotAI.mount({id:'test/helpdesk', options:{isAgent:true}});</script></body></html>`}));
  await page.goto('/helpdesk-harness'); await page.evaluate(() => window.ready);
  const root = page.locator('#docsbot-widget-embed'), input = root.locator('textarea');
  await input.fill('I need support'); await input.press('Enter');
  await expect(root.getByRole('button',{name:'Start voice call'})).toHaveCount(0);
  expect(await page.evaluate(() => DocsBotAI.startVoiceCall())).toBe(false);
  await root.getByRole('button',{name:'Contact support'}).click();
  await expect(root.getByText(mode === 'ticket' ? 'Your request has been sent to support.' : 'Waiting for a support agent…')).toBeVisible();
  await input.fill('Hello operator'); await input.press('Enter');
  await expect(input).toHaveValue('Hello operator');
  await input.press('Enter');
  await expect.poll(() => sends).toBe(2);
  expect(aiRequests).toBe(1);
  messages.push({id:'reply1',type:'reply',sender:'agent',text:'Operator reply',createdAt:new Date().toISOString()});
  await expect(root.getByText('Operator reply')).toBeVisible({timeout:10000});
  config.helpdesk.enabled = false;
  await page.reload(); await page.evaluate(() => window.ready);
  await expect(root.getByText('Operator reply')).toHaveCount(1);
  expect(sessions).toBe(1);
  ticket = {mode,status:'resolved',aiPaused:false};
  await input.fill('Back to AI'); await input.press('Enter');
  await expect.poll(() => aiRequests).toBe(2);
});


test('takeover during an AI stream restores the visitor draft for human retry', async ({page}) => {
  await installWidgetMocks(page, {...mockWidgetConfig, isAgent:true, helpdesk:{enabled:true,mode:'live'}});
  let ticket = null, visitorText = null;
  await page.route('https://api.docsbot.ai/teams/**/helpdesk/sessions', route => route.fulfill({json:{conversationId:'hd_takeover',token:'secret'}}));
  await page.route('https://api.docsbot.ai/teams/**/conversations/**/helpdesk**', route => {
    if (route.request().url().endsWith('/messages')) {
      visitorText = route.request().postDataJSON().text;
      return route.fulfill({json:{message:{id:'v1',type:'reply',sender:'visitor',text:visitorText}}});
    }
    return route.fulfill({json:{ticket,messages:[]}});
  });
  await page.route('https://api.docsbot.ai/teams/**/chat-agent', async route => {
    ticket = {mode:'live',status:'open',aiPaused:true};
    await route.fulfill({contentType:'text/event-stream',body:'event: stream\ndata: Partial response\n\nevent: error\ndata: {"code":"HELPDESK_AI_PAUSED"}\n\n'});
  });
  await page.route('**/takeover-harness', route => route.fulfill({contentType:'text/html',body:`<html><body><div id="docsbot-widget-embed" style="height:650px"></div><script src="/chat.js"></script><script>window.ready = DocsBotAI.mount({id:'test/takeover',options:{isAgent:true}});</script></body></html>`}));
  await page.goto('/takeover-harness'); await page.evaluate(() => window.ready);
  const root = page.locator('#docsbot-widget-embed'), input = root.locator('textarea');
  await input.fill('Need a person'); await input.press('Enter');
  await expect(input).toHaveValue('Need a person');
  await expect(root.getByText('Waiting for a support agent…')).toBeVisible();
  await expect(root.getByText('HELPDESK_AI_PAUSED')).toHaveCount(0);
  await input.press('Enter'); await expect.poll(() => visitorText).toBe('Need a person');
});

test('expired protected session offers reset and never downgrades to AI', async ({page}) => {
  await installWidgetMocks(page, {...mockWidgetConfig, isAgent:true, helpdesk:{enabled:false,mode:'live'}});
  let aiRequests = 0, sessionRequests = 0;
  await page.addInitScript(() => {
    localStorage.setItem('DocsBot_expired_conversationId', 'hd_expired');
    localStorage.setItem('DocsBot_test_expired_helpdesk', JSON.stringify({conversationId:'hd_expired',token:'[REDACTED_SECRET]'}));
  });
  await page.route('https://api.docsbot.ai/teams/**/helpdesk/sessions', route => { sessionRequests++; return route.fulfill({status:500}); });
  await page.route('https://api.docsbot.ai/teams/**/conversations/**/helpdesk**', route => route.fulfill({status:404,json:{error:'expired'}}));
  await page.route('https://api.docsbot.ai/teams/**/chat-agent', route => { aiRequests++; return route.fulfill({status:500}); });
  await page.route('**/expired-harness', route => route.fulfill({contentType:'text/html',body:`<html><body><div id="docsbot-widget-embed" style="height:650px"></div><script src="/chat.js"></script><script>window.ready = DocsBotAI.mount({id:'test/expired',options:{isAgent:true}});</script></body></html>`}));
  await page.goto('/expired-harness'); await page.evaluate(() => window.ready);
  const root = page.locator('#docsbot-widget-embed'), input = root.locator('textarea');
  await input.fill('Hello'); await input.press('Enter');
  await expect(input).toHaveValue('Hello');
  await expect(root.getByText('Could not reach support. Please try again.')).toBeVisible();
  await expect(root.getByRole('button',{name:'Reset conversation'})).toBeVisible();
  expect(aiRequests).toBe(0); expect(sessionRequests).toBe(0);
});

test('lead capture uses the protected conversation capability without exposing it in metadata', async ({page}) => {
  await installWidgetMocks(page, {...mockWidgetConfig, isAgent:true, helpdesk:{enabled:true,mode:'ticket'}, leadCollect:{enabled:true, mode:'before_response', fields:[{key:'email',label:'Email',type:'email',required:true}]}});
  let lead = null;
  await page.route('https://api.docsbot.ai/teams/**/helpdesk/sessions', route => route.fulfill({json:{conversationId:'hd_lead',token:'lead-secret'}}));
  await page.route('https://api.docsbot.ai/teams/**/conversations/**/helpdesk', route => route.fulfill({json:{ticket:null,messages:[]}}));
  await page.route('https://api.docsbot.ai/teams/**/conversations/**/lead', route => {
    lead = {url:route.request().url(), headers:route.request().headers(), body:route.request().postDataJSON()};
    return route.fulfill({json:{}});
  });
  await page.route('**/lead-harness', route => route.fulfill({contentType:'text/html',body:`<html><body><div id="docsbot-widget-embed" style="height:650px"></div><script src="/chat.js"></script><script>window.ready = DocsBotAI.mount({id:'test/lead',options:{isAgent:true}});</script></body></html>`}));
  await page.goto('/lead-harness'); await page.evaluate(() => window.ready);
  const root = page.locator('#docsbot-widget-embed'), input = root.locator('textarea');
  await input.fill('A question'); await input.press('Enter');
  await root.getByLabel('Email').fill('visitor@example.com');
  await root.getByRole('button',{name:'Continue'}).click();
  await expect.poll(() => lead).not.toBeNull();
  expect(lead.url).toContain('/conversations/hd_lead/lead');
  expect(lead.headers['x-helpdesk-token']).toBe('lead-secret');
  expect(JSON.stringify(lead.body)).not.toContain('lead-secret');
  expect(lead.body.metadata.email).toBe('visitor@example.com');
});

test('public reply attachments download with capability and private notes stay hidden', async ({page}, testInfo) => {
  const { readFile } = await import('node:fs/promises');
  await installWidgetMocks(page, {...mockWidgetConfig, isAgent:true, helpdesk:{enabled:true,mode:'ticket'}});
  await page.addInitScript(() => {
    localStorage.setItem('DocsBot_files_conversationId', 'hd_files');
    localStorage.setItem('DocsBot_test_files_helpdesk', JSON.stringify({conversationId:'hd_files',token:'file-secret'}));
    const original = URL.createObjectURL;
    URL.createObjectURL = function(blob) { window.downloadBlobType = blob.type; return original.call(this,blob); };
  });
  await page.route('https://api.docsbot.ai/teams/**/conversations/**/helpdesk/attachments/**', route => {
    expect(route.request().headers()['x-helpdesk-token']).toBe('file-secret');
    expect(route.request().headers().authorization).toBe('Bearer bot-signature');
    expect(route.request().url()).toContain('/attachments/file-1');
    return route.fulfill({contentType:'text/html', body:'<script>danger</script>'});
  });
  await page.route('https://api.docsbot.ai/teams/**/conversations/**/helpdesk', route => route.fulfill({json:{ticket:{mode:'ticket',status:'open',aiPaused:true},messages:[
    {id:'public-1',type:'reply',sender:'agent',text:'',attachments:[{id:'file-1',name:'../report.html',size:23,mime:'text/html'}]},
    {id:'private-1',type:'note',sender:'agent',text:'Private note',attachments:[{id:'secret-file',name:'private.txt',size:5,mime:'text/plain'}]}
  ]}}));
  await page.route('**/files-harness', route => route.fulfill({contentType:'text/html',body:`<html><body><div id="docsbot-widget-embed" style="height:650px"></div><script src="/chat.js"></script><script>window.ready = DocsBotAI.mount({id:'test/files',signature:'bot-signature',options:{isAgent:true}});</script></body></html>`}));
  await page.goto('/files-harness'); await page.evaluate(() => window.ready);
  const root = page.locator('#docsbot-widget-embed');
  const fileButton = root.getByRole('button',{name:'_report.html'});
  await expect(fileButton).toBeVisible();
  await expect(root.getByText('Private note')).toHaveCount(0);
  await expect(root.getByRole('button',{name:'private.txt'})).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent('download'),fileButton.click()]);
  expect(download.suggestedFilename()).toBe('_report.html');
  const path = testInfo.outputPath('downloaded-file');
  await download.saveAs(path);
  expect(await readFile(path,'utf8')).toBe('<script>danger</script>');
  expect(await page.evaluate(() => window.downloadBlobType)).toBe('application/octet-stream');
  expect(page.url()).toContain('/files-harness');
  await page.reload(); await page.evaluate(() => window.ready);
  await expect(root.getByRole('button',{name:'_report.html'})).toHaveCount(1);
  await expect(root.getByRole('button',{name:'private.txt'})).toHaveCount(0);
});

test('realtime invalidations refresh protected snapshots without healthy idle polling', async ({page}) => {
  await installWidgetMocks(page, {...mockWidgetConfig, isAgent:true, helpdesk:{enabled:true,mode:'ticket'}});
  await page.addInitScript(() => {
    localStorage.setItem('DocsBot_realtime_conversationId', 'hd_realtime');
    localStorage.setItem('DocsBot_test_realtime_helpdesk', JSON.stringify({conversationId:'hd_realtime',token:'visitor-secret'}));
    window.testSockets = [];
    window.WebSocket = class {
      constructor(url, protocols) { this.url=url; this.protocols=protocols; this.closed=false; window.testSockets.push(this); }
      close() { this.closed=true; }
      receive(frame) { this.onmessage?.({data:JSON.stringify(frame)}); }
    };
  });
  let grants=0, snapshots=0, release, started;
  new Promise(resolve=>{started=resolve;});
  const snapshotGate=new Promise(resolve=>{release=resolve;});
  await page.route('https://api.docsbot.ai/teams/**/conversations/**/helpdesk/realtime', route => {
    grants++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['x-helpdesk-token']).toBe('visitor-secret');
    return route.fulfill({json:{enabled:true,url:'wss://gateway.example/connect',token:'short-lived-grant',expiresAt:new Date(Date.now()+120000).toISOString()}});
  });
  await page.route('https://api.docsbot.ai/teams/**/conversations/**/helpdesk', async route => {
    snapshots++;
    if (snapshots===2) await snapshotGate;
    await route.fulfill({json:{ticket:null,messages:[]}});
  });
  await page.route('**/realtime-harness', route => route.fulfill({contentType:'text/html',body:`<html><body><div id="docsbot-widget-embed" style="height:650px"></div><script src="/chat.js"></script><script>window.ready=DocsBotAI.mount({id:'test/realtime',options:{isAgent:true}});</script></body></html>`}));
  await page.goto('/realtime-harness'); await page.evaluate(() => window.ready);
  await expect.poll(() => snapshots).toBe(1);
  await expect.poll(() => grants).toBe(1);
  await expect.poll(() => page.evaluate(() => Boolean(window.testSockets.find(s => s.protocols?.[0] === 'docsbot.helpdesk.v1')))).toBe(true);
  await page.evaluate(() => { window.helpdeskSocket = window.testSockets.find(s => s.protocols?.[0] === 'docsbot.helpdesk.v1'); });
  expect(await page.evaluate(() => window.helpdeskSocket.protocols)).toEqual(['docsbot.helpdesk.v1','grant.short-lived-grant']);
  expect(await page.evaluate(() => window.helpdeskSocket.url)).toBe('wss://gateway.example/connect');
  await page.evaluate(() => window.helpdeskSocket.receive({v:1,type:'ready'}));
  await expect.poll(() => snapshots).toBe(2);
  await page.evaluate(() => { window.helpdeskSocket.receive({v:1,type:'invalidate'}); window.helpdeskSocket.receive({v:1,type:'invalidate'}); });
  release(); await expect.poll(() => snapshots).toBe(3);
  await page.waitForTimeout(5500);
  expect(snapshots).toBe(3);
  await page.evaluate(() => DocsBotAI.clearChatHistory());
  expect(await page.evaluate(() => window.helpdeskSocket.closed)).toBe(true);
  await page.evaluate(() => window.helpdeskSocket.receive({v:1,type:'invalidate'}));
  await page.waitForTimeout(100); expect(snapshots).toBe(3);
});

test('narrow helpdesk feedback stays readable and actions remain usable', async ({page}) => {
  await page.setViewportSize({width:320,height:700});
  await installWidgetMocks(page,{...mockWidgetConfig,isAgent:true,useEscalation:true,questions:[],helpdesk:{enabled:true,mode:'live'}});
  let ticket=null, attempts=0;
  await page.route('https://api.docsbot.ai/teams/**/helpdesk/sessions',route=>route.fulfill({json:{conversationId:'hd_layout',token:'[REDACTED_SECRET]'}}));
  await page.route('https://api.docsbot.ai/teams/**/conversations/**/helpdesk**',route=>{
    if(route.request().url().endsWith('/realtime'))return route.fulfill({json:{enabled:false}});
    if(route.request().method()==='POST') { attempts++; if(attempts===1)return route.fulfill({status:503}); ticket={mode:'live',status:'open',aiPaused:true}; }
    return route.fulfill({json:{ticket,messages:[]}});
  });
  await page.route('**/layout-harness',route=>route.fulfill({contentType:'text/html',body:`<html><body style="margin:0"><div id="docsbot-widget-embed" style="width:320px;height:700px"></div><script src="/chat.js"></script><script>window.ready=DocsBotAI.mount({id:'test/layout',options:{isAgent:true}});</script></body></html>`}));
  await page.goto('/layout-harness'); await page.evaluate(()=>window.ready);
  const root=page.locator('#docsbot-widget-embed'), input=root.locator('textarea');
  await input.fill('I need support'); await input.press('Enter');
  const yes=root.getByRole('button',{name:'Contact support'}), no=root.getByRole('button',{name:'No',exact:true});
  await yes.click();
  const alert=root.getByRole('alert').filter({hasText:'Could not reach support.'});
  await expect(alert).toBeVisible();
  const [alertBox,yesBox,noBox]=await Promise.all([alert.boundingBox(),yes.boundingBox(),no.boundingBox()]);
  expect(alertBox.y+alertBox.height).toBeLessThanOrEqual(yesBox.y);
  expect(yesBox.height).toBeGreaterThanOrEqual(44);
  expect(noBox.height).toBeGreaterThanOrEqual(44);
  expect(noBox.width).toBeGreaterThanOrEqual(44);
  await yes.click();
  const status=root.getByRole('status').filter({hasText:'Waiting for a support agent'});
  await expect(status).toBeVisible();
  const [statusBox,inputBox]=await Promise.all([status.boundingBox(),input.boundingBox()]);
  expect(statusBox.y+statusBox.height).toBeLessThan(inputBox.y);
  expect(await root.locator('.docsbot-wrapper').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
