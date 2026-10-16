import { manifest } from '../../src/components/generativeUi/contract.mjs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const artifactDir = path.resolve('output/playwright/openui');
const devOrigin = new URL(process.env.WIDGET_TEST_URL || 'http://127.0.0.1:3005').origin;
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(devOrigin).hostname)) {
  throw new Error('Synthetic OpenUI tests require a localhost widget server');
}
const hash = manifest.specSha256;
const program = [
  'root = Stack([heading, body, notice, resolved, tasks, comparison])',
  'heading = TextContent("Synthetic support report", "large-heavy")',
  'body = TextContent("Fictional fixture data only. Café 日本語 ✅")',
  'notice = Callout("info", "Fixture notice", "No staging sources or model provider are used.")',
  'resolved = Card([TextContent("Resolved tickets"), TextContent("42", "large-heavy"), TextContent("This week", "small")])',
  'tasks = TextContent("- Review inbox\\n- Assign owners\\n- Reply to customers")',
  'comparison = Table([Col("Team", ["Alpha", "Beta"]), Col("Open", [8, 5], "number"), Col("Resolved", [42, 31], "number")])',
].join('\n');
const payload = response => ({ response, libraryVersion: manifest.componentLibraryVersion, specSha256: hash });
const answer = 'The fictional teams resolved 73 tickets. [1]';
const source = { title: 'Synthetic support reference', url: 'https://example.invalid/fixture-reference', type: 'url' };
const config = {
  name: 'Synthetic OpenUI fixture', botName: 'Synthetic OpenUI fixture',
  description: 'Offline fixture: no staging data or model calls.',
  color: '#0e7490', language: 'en', allowedDomains: [], questions: [], isAgent: true,
  useGenerativeUI: true, useWebSearch: false, useCustomButtons: false,
  useCalendly: false, useCalCom: false, useTidyCal: false,
  useFeedback: false, useEscalation: false, useVoiceAgent: false,
  useImageUpload: false, useAudioUpload: false, leadCollect: false,
  piiRedaction: false, labels: { firstMessage: 'Synthetic fixture ready.' },
};
const html = `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Synthetic OpenUI renderer test</title>
<style>body{margin:0;background:#eef2f6;color:#111827;font:15px system-ui}main{max-width:740px;margin:24px auto}h1{font-size:22px}#docsbot-widget-embed{height:820px;background:white;border-radius:12px;overflow:hidden}</style>
<main><h1>Synthetic OpenUI renderer test</h1><p>Fixture responses only · all external requests blocked</p><div id="docsbot-widget-embed"></div></main>
<script>globalThis[Symbol.for('openui.devtools.autoMount')]=true;</script>
<script src="/chat.js"></script><script>
window.fixtureEvents=[];
document.addEventListener('docsbot_tool_call',event=>window.fixtureEvents.push({type:'tool',detail:event.detail}));
document.addEventListener('docsbot_fetching_answer_complete',()=>window.fixtureEvents.push({type:'done'}));
DocsBotAI.mount({id:'fixture-team/fixture-bot',options:{localDev:true,localApiBase:'http://127.0.0.1:9000',
isAgent:true,useGenerativeUI:new URLSearchParams(location.search).get('enabled')!=='0',
color:new URLSearchParams(location.search).get('brand')||'#0e7490',
useWebSearch:false,useCustomButtons:false,useCalendly:false,useCalCom:false,useTidyCal:false,
useFeedback:false,useEscalation:false,useVoiceAgent:false,useImageUpload:false,useAudioUpload:false,
piiRedaction:false,leadCollect:false,testing:true,theme:new URLSearchParams(location.search).get('theme')||'light',questions:[]}});
</script></html>`;

function sse(event, data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return `event: ${event}\n${text.split('\n').map(line => `data: ${line}`).join('\n')}\n\n`;
}

async function installFixture(page) {
  const blocked = [];
  const liveApiRequests = [];
  page.on('request', request => {
    if (request.url().includes('/chat-agent')) liveApiRequests.push(request.url());
  });
  // Intercept fetch in the page so SSE bytes can be delivered in controlled
  // chunks. This runs before the widget loads and never calls the local API.
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fixtureRequests = [];
    window.fetch = (input, options = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!url.includes('/chat-agent')) return originalFetch(input, options);
      window.fixtureRequests.push(JSON.parse(options.body));
      const stream = new ReadableStream({
        start(controller) { window.fixtureController = controller; },
      });
      return Promise.resolve(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
    };
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/__openui-fixture')) {
      await route.fulfill({ contentType: 'text/html', body: url.searchParams.has('floating') ? html.replace('id="docsbot-widget-embed"', 'id="fixture-floating-shell"') : html });
    } else if (url.pathname === '/api/widget/fixture-team/fixture-bot') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(config) });
    } else if (url.pathname === '/__fixture-photo.svg') {
      await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#d9eef0"/><path d="M0 310L190 65L350 300L480 120L640 330V360H0Z" fill="#397b7b"/><path d="M135 135L190 65L242 140L194 118Z" fill="#fff"/><rect x="365" y="234" width="130" height="98" rx="6" fill="#dba875"/><path d="M348 238L430 175L512 238Z" fill="#254d57"/><rect x="417" y="275" width="28" height="57" fill="#254d57"/><circle cx="548" cy="70" r="30" fill="#f6cc79"/></svg>' });
    } else if (url.origin === devOrigin && !url.pathname.includes('/chat-agent')) {
      await route.continue();
    } else {
      blocked.push(url.origin + url.pathname);
      await route.abort('blockedbyclient');
    }
  });
  return { blocked, liveApiRequests };
}

async function openFixture(page, enabled = true) {
  const network = await installFixture(page);
  await page.goto(`/__openui-fixture?enabled=${enabled ? 1 : 0}`);
  await expect(page.getByRole('textbox', { name: 'Send a message...' })).toBeVisible();
  await expect(page.locator('#webpack-dev-server-client-overlay')).toHaveCount(0);
  return network;
}

async function ask(page) {
  const input = page.getByRole('textbox', { name: 'Send a message...' });
  await input.fill('Show the synthetic fixture report.');
  await input.press('Enter');
  await expect.poll(() => page.evaluate(() => window.fixtureRequests.length)).toBe(1);
  const request = await page.evaluate(() => window.fixtureRequests[0]);
  expect(request.human_escalation).toBe(false);
  expect(request.followup_rating).toBe(false);
  expect(request.web_search).toBeUndefined();
  expect(request.custom_buttons).toBeUndefined();
  expect(request.calendly).toBe(false);
  expect(request.calcom).toBe(false);
  expect(request.tidycal).toBe(false);
  return request;
}

async function push(page, bytes) {
  await page.evaluate(bytes => window.fixtureController.enqueue(new TextEncoder().encode(bytes)), bytes);
}

async function finish(page, generativeUI, text = answer) {
  await push(page, sse('done', {
    answer: text, id: 'synthetic-answer', sources: [source],
    ...(generativeUI ? { generativeUI } : {}),
    history: [
      { role: 'user', message: 'Show the synthetic fixture report.' },
      { role: 'assistant', message: text, ...(generativeUI ? { generativeUI } : {}) },
    ],
  }));
  await page.evaluate(() => window.fixtureController.close());
  await expect.poll(() => page.evaluate(() => window.fixtureEvents.some(event => event.type === 'done'))).toBe(true);
}

async function screenshot(page, name, testInfo) {
  await mkdir(artifactDir, { recursive: true });
  const file = path.join(artifactDir, `${name}.png`);
  const surface = page.getByRole('group', {name:'Generated interface'});
  if (await surface.count()) await surface.first().evaluate(el=>{for(let parent=el;parent;parent=parent.parentElement || parent.getRootNode()?.host){if(getComputedStyle(parent).position==='fixed'){const width=parent.getBoundingClientRect().width;parent.style.position='relative';parent.style.inset='auto';parent.style.width=width+'px';parent.style.margin='20px auto';}parent.style.maxHeight='none';parent.style.height='auto';parent.style.overflow='visible';} const embed=document.querySelector('#docsbot-widget-embed'); if(embed) embed.style.height='auto';});
  await page.screenshot({ path: file, fullPage: true, animations:'disabled' });
  const surfaceBox = await surface.count() ? await surface.first().boundingBox() : null;
  if (surfaceBox?.width > 0 && surfaceBox?.height > 0) await surface.first().screenshot({path:path.join(artifactDir, `${name}-surface.png`),animations:'disabled'});
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

async function assertComponents(page) {
  const ui = page.getByRole('group', { name: 'Generated interface' });
  await expect(ui).toBeVisible();
  await expect(ui.getByText('Synthetic support report', {exact:true})).toBeVisible();
  await expect(ui.getByText('Fictional fixture data only. Café 日本語 ✅')).toBeVisible();
  await expect(ui.getByText('Fixture notice', {exact:true})).toBeVisible();
  await expect(ui.getByText('Resolved tickets', { exact: true })).toBeVisible();
  await expect(ui.getByText('This week', { exact: true })).toBeVisible();
  await expect(ui.getByText('Review inbox', {exact:false})).toBeVisible();
  await expect(ui.getByRole('table')).toBeVisible();
  await expect(ui.getByRole('columnheader')).toHaveCount(3);
  await expect(ui.getByRole('row')).toHaveCount(3);
  await expect(ui.getByRole('cell', { name: 'Alpha', exact: true })).toBeVisible();
  return ui;
}

test('all six components coexist with text, citation/source links and tool events', async ({ page }, testInfo) => {
  const network = await openFixture(page);
  expect((await ask(page)).generative_ui).toBe(true);
  await push(page, sse('tool_call', { name: 'search_documentation', params: JSON.stringify({ query: 'synthetic fixture' }) }));
  await expect.poll(() => page.evaluate(() => window.fixtureEvents.filter(event => event.type === 'tool'))).toEqual([
    { type: 'tool', detail: { name: 'search_documentation', data: { query: 'synthetic fixture' } } },
  ]);
  await push(page, sse('stream', answer));
  await push(page, sse('generative_ui_delta', program));
  await finish(page, payload(program));
  const ui = await assertComponents(page);
  await expect(ui).toHaveAttribute('aria-busy', 'false');
  expect(await ui.evaluate(el => Boolean(el.closest('.docsbot-chat-bot-message')))).toBe(false);
  await expect(page.getByText('The fictional teams resolved 73 tickets.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Synthetic support reference' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('#docsbotai-root').analyze();
  const violations = axe.violations.filter(item => ['critical', 'serious'].includes(item.impact));
  expect(violations).toEqual([]);
  expect(network.liveApiRequests).toEqual([]);
  await testInfo.attach('network-isolation', { body: JSON.stringify({ liveApiRequests: network.liveApiRequests, blocked: network.blocked }), contentType: 'application/json' });
  await screenshot(page, 'all-components', testInfo);
});

test('disabled UI omits the opt-in and preserves a readable text response', async ({ page }, testInfo) => {
  const network = await openFixture(page, false);
  expect((await ask(page)).generative_ui).toBeUndefined();
  await push(page, sse('stream', answer));
  await finish(page, null);
  await expect(page.getByRole('group', { name: 'Generated interface' })).toHaveCount(0);
  await expect(page.getByText('The fictional teams resolved 73 tickets.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Synthetic support reference' })).toBeVisible();
  expect(network.liveApiRequests).toEqual([]);
  await screenshot(page, 'ui-disabled-text-fallback', testInfo);
});

for (const [name, badPayload] of [
  ['action-component', payload('root = Stack([button])\nbutton = Button("Run", @execute())')],
  ['spec-mismatch', { ...payload(program), specSha256: 'untrusted-spec' }],
  ['malformed-syntax', payload('root = Stack(???)')],
]) {
  test(`malformed payload (${name}) leaves ordinary text usable`, async ({ page }, testInfo) => {
    const network = await openFixture(page);
    await ask(page);
    await push(page, sse('stream', answer));
    await finish(page, badPayload);
    await expect(page.getByText('The fictional teams resolved 73 tickets.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Synthetic support reference' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run', exact: true })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Generated interface' }).getByRole('heading')).toHaveCount(0);
    expect(network.liveApiRequests).toEqual([]);
    await screenshot(page, `fallback-${name}`, testInfo);
  });
}

test('partial SSE and UI chunks render progressively and complete safely', async ({ page }, testInfo) => {
  await openFixture(page);
  await ask(page);
  const partial = 'root = Stack([heading, body])\nheading = TextContent("Streaming fixture", "large-heavy")\nbody = TextContent("Partial';
  const wire = sse('generative_ui_delta', partial);
  await push(page, wire.slice(0, 23));
  await expect(page.getByRole('group', { name: 'Generated interface' })).toHaveCount(0);
  await push(page, wire.slice(23));
  const ui = page.getByRole('group', { name: 'Generated interface' });
  await expect(ui).toHaveAttribute('aria-busy', 'true');
  await expect(ui.getByText('Streaming fixture', {exact:true})).toBeVisible();
  await screenshot(page, 'partial-stream', testInfo);
  const suffix = ' output completed.")';
  await push(page, sse('generative_ui_delta', suffix));
  await push(page, sse('stream', answer));
  await finish(page, payload(partial + suffix));
  await expect(ui).toHaveAttribute('aria-busy', 'false');
  await expect(ui.getByText('Partial output completed.')).toBeVisible();
  await screenshot(page, 'completed-stream', testInfo);
});

test('saved conversation replays all components after reload without a chat request', async ({ page }, testInfo) => {
  const network = await openFixture(page);
  await ask(page);
  await push(page, sse('stream', answer));
  await finish(page, payload(program));
  await assertComponents(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('DocsBot_fixture-bot_chatHistory') || '')).toContain('generativeUI');
  await page.goto('/__openui-fixture?enabled=0');
  await assertComponents(page);
  await expect(page.getByRole('link', { name: 'Synthetic support reference' })).toBeVisible();
  expect(await page.evaluate(() => window.fixtureRequests)).toEqual([]);
  expect(network.liveApiRequests).toEqual([]);
  await screenshot(page, 'history-replay', testInfo);
});

const imageCards = [
  'root = Stack([title, cards])',
  'title = TextContent("Fictional cabin collection", "large-heavy")',
  'cards = Stack([first, second], "row", "m", "stretch", "start", true)',
  'first = Card([Image("Alpine cabin illustration", "http://127.0.0.1:3005/__fixture-photo.svg"), CardHeader("Alpine Cabin", "A fictional weekend retreat"), TextContent("Two guests · mountain views"), Tag("Sample listing")])',
  'second = Card([ImageBlock("http://127.0.0.1:3005/__fixture-photo.svg", "Forest cabin illustration"), CardHeader("Forest Lodge", "Fictional sample content"), TextContent("Four guests · forest trail")])',
].join('\n');

test('official image cards use styled surfaces outside the message bubble', async ({ page }, testInfo) => {
  await openFixture(page); await ask(page); await finish(page, payload(imageCards));
  const ui = page.getByRole('group', { name: 'Generated interface' });
  await expect(ui.getByText('Alpine Cabin', { exact:true })).toBeVisible();
  await expect(ui.getByRole('img', { name:'Alpine cabin illustration' })).toBeVisible();
  await expect.poll(() => ui.getByRole('img', { name:'Alpine cabin illustration' }).evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  expect(await ui.evaluate(el => Boolean(el.closest('.docsbot-chat-bot-message')))).toBe(false);
  await screenshot(page, 'official-image-cards', testInfo);
});

for (const [name, chart] of [
  ['bar', 'BarChart(["Jan", "Feb", "Mar"], [Series("Resolved", [20, 35, 42])], "grouped")'],
  ['line', 'LineChart(["Jan", "Feb", "Mar"], [Series("Resolved", [20, 35, 42])], "linear")'],
  ['area', 'AreaChart(["Jan", "Feb", "Mar"], [Series("Resolved", [20, 35, 42])])'],
  ['horizontal-bar', 'HorizontalBarChart(["Alpha", "Beta", "Gamma"], [Series("Resolved", [20, 35, 42])], "grouped")'],
  ['pie', 'PieChart(["Resolved", "Open"], [73, 13], "pie")'],
  ['donut', 'PieChart(["Resolved", "Open"], [73, 13], "donut")'],
  ['radar', 'RadarChart(["Speed", "Quality", "Coverage"], [Series("Alpha", [80, 90, 70])])'],
  ['radial', 'RadialChart(["Alpha", "Beta"], [73, 42])'],
  ['stacked-bar', 'SingleStackedBarChart(["Resolved", "Open"], [73, 13])'],
  ['scatter', 'ScatterChart([ScatterSeries("Samples", [Point(1, 20), Point(2, 35), Point(3, 42)])], "Week", "Resolved")'],
]) {
  test(`official ${name} chart renders a graph from synthetic data`, async ({ page }, testInfo) => {
    await openFixture(page); await ask(page);
    await finish(page, payload(`root = Stack([card])\ncard = Card([CardHeader("Synthetic ${name} chart"), graph])\ngraph = ${chart}`));
    const ui = page.getByRole('group', { name: 'Generated interface' });
    await expect(ui.getByText(`Synthetic ${name} chart`, {exact:true})).toBeVisible();
    if (name === 'stacked-bar') await expect(ui.getByRole('img', {name:'Segmented bar'})).toBeVisible();
    else await expect.poll(() => ui.locator('svg').count()).toBeGreaterThan(0);
    await screenshot(page, `chart-${name}`, testInfo);
  });
}

const formProgram = [
  'root = Stack([card])',
  'card = Card([CardHeader("Demo preferences", "Synthetic form values stay in the intercepted chat"), form])',
  'form = Form("preferences", actions, [nameField, emailField, messageField])',
  'nameField = FormControl("Name", Input("name", "Demo name", "text", {required:true, minLength:2}))',
  'emailField = FormControl("Email", Input("email", "demo@example.invalid", "email", {required:true, email:true}))',
  'messageField = FormControl("Notes", TextArea("notes", "Optional notes", 3))',
  'actions = Buttons([Button("Save preferences", @ToAssistant("Save demo preferences"), "primary")])',
].join('\n');

test('official form validates inputs and sends values only after an explicit submit', async ({ page }, testInfo) => {
  const network = await openFixture(page); await ask(page); await finish(page, payload(formProgram));
  const ui = page.getByRole('group', {name:'Generated interface'});
  await ui.getByRole('button', {name:'Save preferences'}).click();
  await ui.getByRole('textbox', {name:/^Name\*?$/}).fill('Casey Fixture');
  await ui.getByRole('textbox', {name:/^Email\*?$/}).fill('casey@example.invalid');
  await ui.getByRole('textbox', {name:'Notes', exact:true}).fill('Synthetic values only');
  await screenshot(page, 'official-form', testInfo);
  await ui.getByRole('button', {name:'Save preferences'}).click();
  await expect.poll(() => page.evaluate(() => window.fixtureRequests.length)).toBe(2);
  const submitted = await page.evaluate(() => window.fixtureRequests[1].question);
  expect(submitted).toContain('Casey Fixture');
  expect(submitted).toContain('casey@example.invalid');
  expect(submitted).toContain('Synthetic values only');
  const bubble = page.locator('.docsbot-user-chat-message').filter({hasText:'Save demo preferences'});
  await expect(bubble).not.toContainText('UI submission:');
  await expect(bubble.getByText('Casey Fixture', {exact:true})).not.toBeVisible();
  await bubble.locator('summary').click();
  await expect(bubble.getByText('Casey Fixture', {exact:true})).toBeVisible();
  await screenshot(page, 'official-form-submission', testInfo);
  expect(network.liveApiRequests).toEqual([]);
});

test('host UI works with UI generation disabled and can cancel the default conversational action', async ({page}, testInfo) => {
  await openFixture(page, false);
  const response = 'root = Stack([Card([TextContent("Host-created choice"), Button("Choose item", @ToAssistant("Choose item", "item-42"))])])';
  const accepted = await page.evaluate(async response => {
    window.uiActions = [];
    document.addEventListener('docsbot_ui_action', event => {
      window.uiActions.push(event.detail);
      event.preventDefault();
    });
    return (await DocsBotAI.addUIMessage({response,message:'Choose a demo item.'})) !== false;
  }, response);
  expect(accepted).toBe(true);
  await page.getByRole('button', {name:'Choose item',exact:true}).click();
  const actions = await page.evaluate(() => window.uiActions);
  expect(actions).toHaveLength(1);
  expect(actions[0].type).toBe('continue_conversation');
  expect(actions[0].teamId).toBe('fixture-team');
  expect(actions[0].botId).toBe('fixture-bot');
  expect(actions[0].messageId).toBeTruthy();
  expect(actions[0].params.context).toBe('item-42');
  expect(actions[0].response).toBe(response);
  expect(await page.evaluate(() => window.fixtureRequests.length)).toBe(0);
  await screenshot(page,'host-created-ui',testInfo);
  expect(await page.evaluate(() => DocsBotAI.addUIMessage({response:'root = Stack([Query("x")])'}))).toBe(false);
});

for (const mode of ['light','dark']) for (const width of [448,900]) {
  test(`compact submission persists ${mode} ${width}`, async ({page},testInfo) => {
    await page.setViewportSize({width,height:1000});
    await openFixture(page);
    await page.evaluate(mode => DocsBotAI.updateOptions({theme:mode}), mode);
    await ask(page); await finish(page,payload(formProgram));
    const ui=page.getByRole('group',{name:'Generated interface'});
    await ui.getByRole('textbox',{name:/^Name\*?$/}).fill('Casey Fixture');
    await ui.getByRole('textbox',{name:/^Email\*?$/}).fill('casey@example.invalid');
    await ui.getByRole('button',{name:'Save preferences'}).click();
    await expect.poll(()=>page.evaluate(()=>window.fixtureRequests.length)).toBe(2);
    const bubble=page.locator('.docsbot-user-chat-message').filter({hasText:'Save demo preferences'});
    await expect(bubble.locator('summary')).toBeVisible();
    await expect(bubble.getByText('Casey Fixture',{exact:true})).not.toBeVisible();
    await finish(page,null,'Preferences received.');
    await bubble.locator('summary').click();
    await expect(bubble.getByText('Casey Fixture',{exact:true})).toBeVisible();
    await screenshot(page,`submission-${width}-${mode}`,testInfo);
    await expect.poll(()=>page.evaluate(()=>localStorage.getItem('DocsBot_fixture-bot_chatHistory')||'')).toContain('UI submission:');
    await page.reload();
    const restored=page.locator('.docsbot-user-chat-message').filter({hasText:'Save demo preferences'});
    await expect(restored.locator('summary')).toBeVisible();
    await restored.locator('summary').click();
    await expect(restored.getByText('casey@example.invalid',{exact:true})).toBeVisible();
  });
}

test('official tabs and accordion change local views without sending requests', async ({page}, testInfo) => {
  await openFixture(page); await ask(page);
  const layout = 'root = Stack([tabs, accordion])\ntabs = Tabs([TabItem("overview", "Overview", [TextContent("Overview fixture content")]), TabItem("details", "Details", [TextContent("Detailed fixture content")])])\naccordion = Accordion([AccordionItem("faq", "Sample question", [TextContent("Synthetic answer inside accordion")])])';
  await finish(page,payload(layout));
  const ui=page.getByRole('group',{name:'Generated interface'});
  await ui.getByRole('tab',{name:'Details',exact:true}).click();
  await expect(ui.getByText('Detailed fixture content')).toBeVisible();
  await ui.getByRole('button',{name:'Sample question'}).click();
  await expect(ui.getByText('Synthetic answer inside accordion')).toBeVisible();
  expect(await page.evaluate(()=>window.fixtureRequests.length)).toBe(1);
  await screenshot(page,'official-local-layout-controls',testInfo);
});

test('text-only history never loads the OpenUI renderer or its component chunk', async ({page}) => {
  const chunks=[];
  page.on('request', request=> { if (/docsbot-openui/.test(request.url())) chunks.push(request.url()); });
  await openFixture(page,false); await ask(page); await finish(page,null);
  await expect(page.getByRole('group',{name:'Generated interface'})).toHaveCount(0);
  expect(chunks).toEqual([]);
});

test('floating widget defers OpenUI until opened with a UI message in history', async ({page}, testInfo) => {
  await openFixture(page); await ask(page); await finish(page,payload(program));
  await assertComponents(page);
  const chunks=[];
  page.on('request', request=> { if (/docsbot-openui/.test(request.url())) chunks.push(request.url()); });
  await page.goto('/__openui-fixture?floating=1&enabled=0');
  await expect(page.getByRole('button',{name:'Help',exact:true})).toBeVisible();
  expect(chunks).toEqual([]);
  await page.getByRole('button',{name:'Help',exact:true}).click();
  await assertComponents(page);
  expect(chunks.length).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.fixtureRequests.length)).toBe(0);
  await screenshot(page,'lazy-history-on-open',testInfo);
});

test('image cards remain inside a narrow mobile viewport', async ({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await openFixture(page); await ask(page); await finish(page,payload(imageCards));
  const ui=page.getByRole('group',{name:'Generated interface'});
  await expect(ui.getByText('Alpine Cabin',{exact:true})).toBeVisible();
  const width=await ui.evaluate(element=>({scroll:element.scrollWidth,client:element.clientWidth}));
  expect(width.scroll).toBeLessThanOrEqual(width.client+1);
  await screenshot(page,'mobile-image-cards',testInfo);
});

test('official selection fields, date picker, slider and switches work locally', async ({page},testInfo)=>{
  await openFixture(page);await ask(page);
  const controls=[
    'root = Stack([card, toggles])',
    'card = Card([CardHeader("Demo controls"), form])',
    'form = Form("controls", Buttons([Button("Confirm selections")]), [priority, contact, preferences, volume, date, interests, plan])',
    'priority = FormControl("Priority", Select("priority", [SelectItem("low", "Low"), SelectItem("high", "High")], "Choose priority"))',
    'contact = FormControl("Contact method", RadioGroup("contact", [RadioItem("Email", "Send email", "email"), RadioItem("Chat", "Use chat", "chat")]))',
    'preferences = FormControl("Updates", CheckBoxGroup("updates", [CheckBoxItem("Product updates", "Fictional notices", "product")]))',
    'volume = FormControl("Volume", Slider("volume", "continuous", 0, 100, 1, [50], "Volume"))',
    'date = FormControl("Date", DatePicker("date", "single"))',
    'interests = FormControl("Interests", Chips("interests", "multiple", [ChipItem("support", "Support"), ChipItem("sales", "Sales")]))',
    'plan = FormControl("Plan", OptionCards("plan", "single", [OptionCard("starter", "Starter", "Fictional basic plan"), OptionCard("team", "Team", "Fictional team plan")]))',
    'toggles = SwitchGroup("notifications", [SwitchItem("Notifications", "Demo preference", "notify")])',
  ].join('\n');
  await finish(page,payload(controls));
  const ui=page.getByRole('group',{name:'Generated interface'});
  await ui.getByRole('combobox').click();
  await page.getByRole('option',{name:'High',exact:true}).click();
  await ui.getByRole('radio',{name:/^Email/}).check();
  await ui.getByRole('checkbox',{name:/Product updates/}).check();
  await expect(ui.getByRole('slider')).toBeVisible();
  await ui.getByRole('slider').press('ArrowRight');
  await expect(ui.getByText('Date',{exact:true})).toBeVisible();
  await ui.getByRole('option',{name:'Support',exact:true}).click();
  await ui.getByRole('switch',{name:/Notifications/}).check();
  expect(await page.evaluate(()=>window.fixtureRequests.length)).toBe(1);
  await screenshot(page,'official-selection-controls',testInfo);
});


test('official components inherit the widget dark theme', async ({page},testInfo)=>{
  await installFixture(page);
  await page.goto('/__openui-fixture?enabled=1&theme=dark');
  await expect(page.getByRole('textbox',{name:'Send a message...'})).toBeVisible();
  await ask(page);await finish(page,payload(imageCards));
  const ui=page.getByRole('group',{name:'Generated interface'});
  await expect(ui.getByText('Alpine Cabin',{exact:true})).toBeVisible();
  expect(await ui.evaluate(el=>el.closest('[data-docsbot-theme]')?.getAttribute('data-docsbot-theme'))).toBe('dark');
  await screenshot(page,'dark-image-cards',testInfo);
});

test('enabled floating widget prewarms OpenUI only after opening', async ({page})=>{
  await installFixture(page);
  const chunks=[];
  page.on('request',request=>{if(/docsbot-openui/.test(request.url()))chunks.push(request.url())});
  await page.goto('/__openui-fixture?floating=1&enabled=1');
  await expect(page.getByRole('button',{name:'Help',exact:true})).toBeVisible();
  expect(chunks).toEqual([]);
  await page.getByRole('button',{name:'Help',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Send a message...'})).toBeVisible();
  await expect.poll(()=>chunks.length).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.fixtureRequests.length)).toBe(0);
});

// Visual catalogue uses the same isolated transport and real widget as regression tests.
const galleryPhoto = `${devOrigin}/__fixture-photo.svg`;
const galleryCases = {
  typography: `root = Stack([CardHeader("Typography and feedback", "Official component styles"), TextContent("TextContent: readable body copy"), MarkDownRenderer("**Markdown** with a short ordered list:\n1. First step\n2. Second step"), InlineHeader("Inline header", "Supporting description"), Label("Standalone label"), Text("text", "Text primitive", "Supporting detail"), BoldText("number", "42", "Resolved tickets"), Callout("success", "Callout", "The fictional task completed."), TextCallout("warning", "TextCallout", "Sample warning message"), CodeBlock("javascript", "const answer = 42;"), Separator(), TagBlock(["Documentation", "Sample"]), Tag("Available", Icon("check"), "md", "success"), IconText(Icon("star"), "info", "m", "Icon text", "Official icon styling"), MetricIndicatorInline("98%", "Satisfaction", {direction:"up", value:4}), MetricIndicatorWithStrikethrough("$79", "Demo offer", "$99", {direction:"down", value:20})])`,
  imagery: `root = Stack([CardHeader("Image components"), Image("Image", "${galleryPhoto}"), ImageBlock("${galleryPhoto}", "ImageBlock"), ImageGallery([{src:"${galleryPhoto}",alt:"Gallery alpine cabin",details:"First gallery image"},{src:"${galleryPhoto}",alt:"Gallery second cabin",details:"Second gallery image"}]), ImageText("${galleryPhoto}", "Cabin", "ImageText", "Compact image and text"), ImageTextLarge("${galleryPhoto}", "Cabin", "ImageTextLarge", "Large image and text")])`,
  structured: `root = Stack([CardHeader("Lists, steps and editable data"), Steps([StepsItem("Create workspace", "Start with sample data"), StepsItem("Review result", "Check the generated interface")]), EntityList([{left:"Open tickets",right:"8",rightVariant:"number"},{left:"Resolved",right:"42",rightVariant:"number"}], "default", {left:"Status",right:"Count"}), ListBlock([ListItem("Alpine Cabin", "Fictional listing", {src:"${galleryPhoto}",alt:"Cabin"}), ListItem("Forest Lodge", "Another fictional listing", {src:"${galleryPhoto}",alt:"Lodge"})], "image"), EditableTable("demoTable", [{type:"text",key:"team",header:"Team"},{type:"number",key:"resolved",header:"Resolved"}], [{id:"a",values:["Alpha",42]},{id:"b",values:["Beta",31]}])])`,
  snippetOverview: `root = Stack([CardHeader("Snippet and overview cards"), SnippetCardBlock([SnippetCardItem("one", IconText(Icon("inbox"), "info", "m", "Inbox", "Support queue"), BoldText("number", "42", "resolved")),SnippetCardItem("two", ImageText("${galleryPhoto}", "Cabin", "Alpine Cabin", "Fictional listing"), Text("number", "$99", "per night"))]), OverviewCardBlock([OverviewCardItem("one", IconText(Icon("star"), "success", "m", "Satisfaction", "Fictional result"), MetricIndicatorInline("98%", "This week", {direction:"up",value:4})), OverviewCardItem("two", Text("number", "73", "Tickets resolved"), MetricIndicatorInline("+12", "vs. last week"))])])`,
  contextVisual: `root = Stack([CardHeader("Context and visual cards"), ContextCardBlock([ContextCardItem("one", Tag("Featured", Icon("star")), "A fictional cabin retreat", "gray", "${galleryPhoto}", "Cabin"),ContextCardItem("two", "Planning notes", "Bring a jacket and enjoy the view.", "gray")]), VisualCardBlock([VisualCardItem(BoldText("text", "Alpine Cabin", "$99 per night"), "one", "${galleryPhoto}", Tag("Demo"), "Cabin")])])`,
  composite: `root = Stack([CardHeader("Composite cards"), CompositeCardBlock([CompositeCardItem("one", ImageTextLarge("${galleryPhoto}", "Cabin", "Alpine Cabin", "Fictional booking example"), [Text("text", "Quiet mountain retreat"), TagBlock(["Wi-Fi", "Mountain view"]), EntityList([{left:"Guests",right:"4"}])], {price:MetricIndicatorWithStrikethrough("$79", "per night", "$99"),button:Button("Ask about this cabin")}), CompositeCardItem("two", ImageTextLarge("${galleryPhoto}", "Forest lodge", "Forest Lodge", "Fictional family retreat"), [Text("text", "A quiet woodland escape"), TagBlock(["Trail access", "Family friendly"]), EntityList([{left:"Guests",right:"6"}])], {price:BoldText("number", "$119", "per night"),button:Button("Ask about this lodge")})])])`,
  carouselButtons: `root = Stack([CardHeader("Carousel and button variants"), Carousel([[CardHeader("First slide"),TextContent("A fictional overview")],[CardHeader("Second slide"),TextContent("More fictional details")]]), Buttons([Button("Primary"),Button("Secondary", @ToAssistant("Show more fictional details"), "secondary"),Button("Tertiary", @ToAssistant("Explain fictional data"), "tertiary")]), IconButton("Favorite",Icon("star")), Card([TextContent("Sunk card variant")], "sunk")])`,
  modal: `root = Stack([TextContent("Dialog example below"), Modal("Demo dialog", true, [TextContent("This is an official OpenUI modal inside the widget integration."), Callout("info", "Local UI", "Close with Escape or the close button.")], "md")])`,
};
for (const [name, response] of Object.entries(galleryCases)) {
  test(`visual catalogue ${name}`, async ({page}, testInfo) => {
    const network = await openFixture(page); await ask(page); await finish(page,payload(response));
    const ui = page.getByRole('group',{name:'Generated interface'});
    await expect(ui).toBeVisible();
    await expect(ui.getByText('Unable to display',{exact:false})).toHaveCount(0);
    // Expand the fixture's scroll shell so screenshots show every rendered row.
    await ui.evaluate(el=>{for(let parent=el;parent;parent=parent.parentElement || parent.getRootNode()?.host){parent.style.maxHeight='none';parent.style.height='auto';parent.style.overflow='visible';} document.querySelector('#docsbot-widget-embed').style.height='auto';});
    if(name==='modal') await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(()=>ui.textContent()).not.toBe('');
    await screenshot(page,`catalogue-${name}`,testInfo);
    expect(network.liveApiRequests).toEqual([]);
  });
}

const brandReviewProgram = [
 'root = Stack([header, actions, formCard, chartCard])',
 'header = CardHeader("Support overview", "Fictional sample data · branded controls")',
 'actions = Buttons([Button("Primary action"), Button("Secondary action", @ToAssistant("Secondary sample"), "secondary"), Button("Text action", @ToAssistant("Text sample"), "tertiary")])',
 'formCard = Card([CardHeader("Your preferences", "Changes are local until you submit"), form])',
 'form = Form("brandReview", Buttons([Button("Save preferences")]), [name, priority, contact, notes])',
 'name = FormControl("Name", Input("name", "Sample name"))',
 'priority = FormControl("Priority", Select("priority", [SelectItem("normal", "Normal"), SelectItem("high", "High")], "Choose priority"))',
 'contact = FormControl("Updates", CheckBoxGroup("updates", [CheckBoxItem("Product updates", "Occasional news", "product", true)]))',
 'notes = FormControl("Notes", TextArea("notes", "Optional notes", 2))',
 'chartCard = Card([CardHeader("Resolved tickets", "Synthetic comparison"), graph])',
 'graph = BarChart(["Alpha", "Beta", "Gamma"], [Series("Resolved", [42, 31, 25])], "grouped", "Team", "Tickets", 220)',
].join('\n');
for(const [brandName,brand] of [['teal','#0e7490'],['purple','#7c3aed'],['yellow','#facc15'],['white','#ffffff'],['black','#000000'],['red','#ef4444']]){
 for(const mode of ['light','dark']){
  test(`brand theme ${brandName} ${mode}`,async({page},testInfo)=>{
   const network=await installFixture(page);
   await page.goto(`/__openui-fixture?brand=${encodeURIComponent(brand)}&theme=${mode}`);
   await expect(page.getByRole('textbox',{name:'Send a message...'})).toBeVisible();
   await ask(page);await finish(page,payload(brandReviewProgram));
   const ui=page.getByRole('group',{name:'Generated interface'});
   const primary=ui.getByRole('button',{name:'Primary action',exact:true});
   await expect(primary).toBeVisible();
   const expected= (await import('../../src/components/generativeUi/theme.mjs')).createOpenUITheme(brand,mode);
   const style=await primary.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
   const normalize=v=>v.replaceAll(' ','');
   await expect.poll(async()=>normalize(await primary.evaluate(el=>getComputedStyle(el).backgroundColor))).toBe(normalize(expected.interactiveAccentDefault));
   await primary.hover();
   await expect.poll(async()=>normalize(await primary.evaluate(el=>getComputedStyle(el).backgroundColor))).toBe(normalize(expected.interactiveAccentHover));
   await primary.focus();
   await ui.getByRole('textbox',{name:'Name',exact:true}).focus();
   await ui.getByRole('textbox',{name:'Name',exact:true}).click();
   await page.keyboard.press('Tab');
   await screenshot(page,`brand-${brandName}-${mode}`,testInfo);
   const axe=await new AxeBuilder({page}).include(['#docsbotai-root', '.docsbot-openui-surface']).analyze();
   expect(axe.violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
   expect(network.liveApiRequests).toEqual([]);
  });
 }
}
test('mobile generated cards stack vertically',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await openFixture(page);await ask(page);await finish(page,payload(imageCards));
 const ui=page.getByRole('group',{name:'Generated interface'});
 const cards=ui.locator('.openui-card');
 const first=await cards.nth(0).boundingBox(),second=await cards.nth(1).boundingBox();
 expect(second.y).toBeGreaterThan(first.y+first.height-1);
 expect(first.width).toBeGreaterThan(290);
 await screenshot(page,'brand-mobile-cards',testInfo);
});

test('branded disabled, hover and keyboard-focus states remain distinct',async({page},testInfo)=>{
 await openFixture(page);await ask(page);await push(page,sse('generative_ui_delta',brandReviewProgram));
 const ui=page.getByRole('group',{name:'Generated interface'});
 const primary=ui.getByRole('button',{name:'Primary action',exact:true});
 await expect(primary).toBeDisabled();
 await screenshot(page,'brand-disabled-streaming',testInfo);
 await finish(page,payload(brandReviewProgram));await expect(primary).toBeEnabled();
 const secondary=ui.getByRole('button',{name:'Secondary action',exact:true});
 await secondary.hover();await screenshot(page,'brand-secondary-hover',testInfo);
 await primary.focus();
 const outline=await primary.evaluate(el=>getComputedStyle(el).outlineStyle);expect(outline).toBe('solid');
 await screenshot(page,'brand-keyboard-focus',testInfo);
});
for(const mode of ['light','dark'])test(`branded mobile form ${mode}`,async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await installFixture(page);
 await page.goto(`/__openui-fixture?brand=%237c3aed&theme=${mode}`);
 await expect(page.getByRole('textbox',{name:'Send a message...'})).toBeVisible();
 await ask(page);await finish(page,payload(brandReviewProgram));
 const ui=page.getByRole('group',{name:'Generated interface'});
 expect(await ui.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await screenshot(page,`brand-mobile-form-${mode}`,testInfo);
});

for(const mode of ['light','dark'])test(`narrow floating widget typography ${mode}`,async({page},testInfo)=>{
 await installFixture(page);await page.goto(`/__openui-fixture?floating=1&theme=${mode}`);
 await page.getByRole('button',{name:'Help',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Send a message...'})).toBeVisible();await ask(page);
 await finish(page,payload(brandReviewProgram));
 const ui=page.getByRole('group',{name:'Generated interface'});
 const box=await ui.boundingBox();expect(box.width).toBeLessThan(420);expect(box.width).toBeGreaterThan(300);
 const body=await page.getByText('The fictional teams resolved 73 tickets.',{exact:false}).evaluate(el=>({size:getComputedStyle(el).fontSize,font:getComputedStyle(el).fontFamily}));
 const form=ui.getByRole('textbox',{name:'Name',exact:true});
 expect(await form.evaluate(el=>getComputedStyle(el).fontSize)).toBe(body.size);
 expect(await form.evaluate(el=>getComputedStyle(el).fontFamily)).toBe(body.font);
 expect(await ui.getByText('Support overview',{exact:true}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(16);
 expect(await ui.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await ui.getByText('Support overview',{exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(artifactDir,`brand-floating-${mode}-viewport.png`),animations:'disabled'});
 await screenshot(page,`brand-floating-${mode}`,testInfo);
});

for(const size of ['narrow','wide'])for(const mode of ['light','dark'])test(`composite grid ${size} ${mode}`,async({page},testInfo)=>{
 await installFixture(page);await page.goto(`/__openui-fixture?theme=${mode}`);
 await page.locator('main').evaluate((el,width)=>{el.style.maxWidth=width+'px';el.style.width=width+'px';},size==='narrow'?448:740);
 await expect(page.getByRole('textbox',{name:'Send a message...'})).toBeVisible();await ask(page);await finish(page,payload(galleryCases.composite));
 const ui=page.getByRole('group',{name:'Generated interface'});
 await expect(ui.getByText('Alpine Cabin',{exact:true})).toBeVisible();await expect(ui.getByText('Forest Lodge',{exact:true})).toBeVisible();
 const items=ui.locator('[data-card-type="CompositeCard"] .openui-medium-card-block__item');await expect(items).toHaveCount(2);
 const a=await items.nth(0).boundingBox(),b=await items.nth(1).boundingBox();
 if(size==='wide'){expect(Math.abs(a.y-b.y)).toBeLessThan(2);expect(b.x).toBeGreaterThan(a.x+a.width-1);}
 else{expect(b.y).toBeGreaterThan(a.y+a.height-1);expect(Math.abs(a.x-b.x)).toBeLessThan(2);}
 await screenshot(page,`composite-grid-${size}-${mode}`,testInfo);
});

const lifecycleLabels = '{pending:"Sending your choice…", submitted:"Submitted — see the reply below", retry:"Response interrupted — review and retry"}';
const lifecycleForm = policy => [
 'root = Stack([scope, tabs])',
 `scope = ActionGroup("request", "${policy}", [card], ${lifecycleLabels})`,
 'card = Card([CardHeader("Demo support request", "Fictional data · explicit submission"), form])',
 'form = Form("request", Buttons([Button("Send request", @ToAssistant("Send support request"))]), [FormControl("Name", Input("name", "Your name")), FormControl("Issue", TextArea("issue", "Describe the issue", 3))])',
 'tabs = Tabs([TabItem("about", "About this demo", [TextContent("No external ticket is created.")]), TabItem("privacy", "Privacy notes", [TextContent("This example uses fictional data only.")])])',
].join('\n');
const lifecycleChoices = [
 'root = Stack([decision, extra])',
 `decision = ActionGroup("decision", "once", [Card([CardHeader("Request a demo?", "Choose one alternative"), Buttons([Button("Request a demo", @ToAssistant("Request the fictional demo")), Button("Maybe later", @ToAssistant("Skip the fictional demo"), "secondary")])])], ${lifecycleLabels})`,
 `extra = ActionGroup("details", "repeatable", [Buttons([Button("Explain the options", @ToAssistant("Explain the demo options"), "secondary")])], ${lifecycleLabels})`,
].join('\n');
const lifecycleProducts = [
 'root = Stack([cards])',
 `cards = ActionGroup("browse", "repeatable", [Stack([first,second], "row", "m", "stretch", "start", true)], ${lifecycleLabels})`,
 'first = Card([Image("Fictional Alpine Cabin", "http://127.0.0.1:3005/__fixture-photo.svg"), CardHeader("Alpine Cabin", "Two guests · sample listing"), Buttons([Button("Explore Alpine", @ToAssistant("Tell me about Alpine Cabin", {itemId:"alpine"}))])])',
 'second = Card([Image("Fictional Forest Lodge", "http://127.0.0.1:3005/__fixture-photo.svg"), CardHeader("Forest Lodge", "Four guests · sample listing"), Buttons([Button("Explore Forest", @ToAssistant("Tell me about Forest Lodge", {itemId:"forest"}))])])',
].join('\n');
const lifecycleHost = `root = Stack([ActionGroup("host", "once", [Card([CardHeader("Application-owned action", "Your website handles this selection"), Buttons([Button("Save demo choice", @ToAssistant("Save my demo choice", "host-demo"))])])], ${lifecycleLabels})])`;
const lifecycleExamples = [
 {id:'once-form',title:'One-time form',question:'Help me send a fictional support request.',program:lifecycleForm('once'),summary:'Describe the missing report, then send this demo request once.',button:'Send request',form:true,once:true,reply:'Your request was received in this demo. Reference DEMO-104. No external ticket was created.'},
 {id:'once-choice',title:'One-time alternative choices',question:'Ask whether I want a fictional product demo.',program:lifecycleChoices,summary:'Choose one option. The two alternatives share a one-time group.',button:'Request a demo',once:true,reply:'You requested the fictional demo. This is a confirmation example; no meeting was booked.'},
 {id:'repeat-products',title:'Repeatable image cards',question:'Show two fictional cabins that I can explore.',program:lifecycleProducts,summary:'Explore either sample cabin. These browsing actions remain available.',button:'Explore Alpine',second:'Explore Forest',reply:'Alpine Cabin is a fictional two-guest retreat with mountain views.',reply2:'Forest Lodge is a fictional four-guest cabin near woodland trails.'},
 {id:'repeat-form',title:'Repeatable editable form',question:'Let me refine a fictional support request before sending another version.',program:lifecycleForm('repeatable'),summary:'You can submit this editable demo again after changing its values.',button:'Send request',form:true,second:'Send request',reply:'Received the first demo request: the monthly report is missing.',reply2:'Received the revised demo request: the weekly report is missing.'},
 {id:'retry',title:'Interrupted request and explicit retry',question:'Demonstrate a fictional support submission with an interrupted response.',program:lifecycleForm('once'),summary:'This demo interrupts the first response so you can review and retry.',button:'Send request',form:true,once:true,retry:true,reply:'The retried demo request was received. No external ticket was created.'},
 {id:'independent',title:'Independent action groups',question:'Show a one-time decision alongside a repeatable explanation button.',program:lifecycleChoices,summary:'The decision locks after use. Asking for an explanation remains available.',button:'Maybe later',second:'Explain the options',once:true,reply:'You chose to skip the fictional demo for now.',reply2:'Request a demo expresses interest; Maybe later skips it. This explanation is repeatable.'},
 {id:'host',title:'Website handles the action',question:'Show a fictional action handled by my website JavaScript.',program:lifecycleHost,summary:'The host application will record the demo choice and add the visible conversation.',button:'Save demo choice',once:true,host:true,reply:'The demo application recorded your choice locally. No model request or external write was made.'},
 {id:'frozen-log',title:'Frozen historical conversation',question:'Show a fictional support request and its read-only history.',program:lifecycleForm('once'),summary:'Submit once, then inspect the conversation as a frozen historical snapshot.',button:'Send request',form:true,once:true,frozen:true,reply:'Demo request received. The historical interface below will remain read-only.'},
];
for(const example of lifecycleExamples) for(const mode of ['light','dark']) for(const width of [448,900]) {
 test(`lifecycle example ${example.id} ${width} ${mode}`, async({page},testInfo)=>{
  const network=await openFixture(page);
  await page.setViewportSize({width,height:1000});
  await page.evaluate(mode=>DocsBotAI.updateOptions({theme:mode}),mode);
  const input=page.getByRole('textbox',{name:'Send a message...'});
  await input.fill(example.question);await input.press('Enter');
  await expect.poll(()=>page.evaluate(()=>window.fixtureRequests.length)).toBe(1);
  await finish(page,payload(example.program),example.summary);
  const ui=page.getByRole('group',{name:'Generated interface'}).first();
  await expect(ui.getByRole('button',{name:example.button,exact:true})).toBeVisible();
  if(example.form){await ui.getByRole('textbox',{name:'Name',exact:true}).fill('Casey Demo');await ui.getByRole('textbox',{name:'Issue',exact:true}).fill('The monthly report is missing.');}
  await screenshot(page,`lifecycle-${example.id}-${width}-${mode}-before`,testInfo);
  if(example.host)await page.evaluate(reply=>{
   document.addEventListener('docsbot_ui_action',event=>{
    if(event.detail.actionGroup?.name!=='host')return;
    event.preventDefault();
    event.detail.respondWith((async()=>{await DocsBotAI.addUserMessage(event.detail.message,false);await DocsBotAI.addBotMessage(reply);return true})());
   });
  },example.reply);
  await ui.getByRole('button',{name:example.button,exact:true}).click();
  if(!example.host){
   await expect.poll(()=>page.evaluate(()=>window.fixtureRequests.length)).toBe(2);
   await expect(ui.locator('[data-action-status="pending"]')).toHaveCount(1);
   await expect(ui.getByRole('button',{name:example.button,exact:true})).toBeDisabled();
   // A programmatic repeated click is also guarded, not only visually disabled.
   await ui.getByRole('button',{name:example.button,exact:true}).dispatchEvent('click');
   expect(await page.evaluate(()=>window.fixtureRequests.length)).toBe(2);
   await screenshot(page,`lifecycle-${example.id}-${width}-${mode}-pending`,testInfo);
   if(example.retry){
    await page.evaluate(()=>window.fixtureController.error(new Error('Synthetic response interrupted')));
    await expect(ui.locator('[data-action-status="retry"]')).toHaveCount(1);
    await expect(ui.getByRole('button',{name:example.button,exact:true})).toBeEnabled();
    await screenshot(page,`lifecycle-${example.id}-${width}-${mode}-retry`,testInfo);
    await ui.getByRole('button',{name:example.button,exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.fixtureRequests.length)).toBe(3);
   }
   await finish(page,null,example.reply);
  }
  await expect(ui.locator('[data-action-status="submitted"]')).toHaveCount(1);
  if(example.once)await expect(ui.getByRole('button',{name:example.button,exact:true})).toBeDisabled();
  if(example.form){
   const bubble=page.locator('.docsbot-user-chat-message').filter({hasText:'Send support request'}).last();
   await bubble.locator('summary').click();
   await expect(bubble.getByText('Casey Demo',{exact:true})).toBeVisible();
   await expect(ui.getByRole('textbox',{name:'Name',exact:true})).toHaveValue('Casey Demo');
  }
  if(example.second){
   if(example.form){
    await expect(ui.getByRole('button',{name:example.second,exact:true})).toBeDisabled();
    await expect(ui.getByRole('textbox',{name:'Issue',exact:true})).toBeEnabled();
    await ui.getByRole('textbox',{name:'Issue',exact:true}).fill('The weekly report is missing.');
   }
   await expect(ui.getByRole('button',{name:example.second,exact:true})).toBeEnabled();
   await ui.getByRole('button',{name:example.second,exact:true}).click();
   await expect.poll(()=>page.evaluate(()=>window.fixtureRequests.length)).toBe(3);
   await finish(page,null,example.reply2);
   await expect(ui.locator('[data-action-status="pending"]')).toHaveCount(0);
   if(example.form){const last=page.locator('.docsbot-user-chat-message').filter({hasText:'Send support request'}).last();await last.locator('summary').click();await expect(last.getByText('The weekly report is missing.',{exact:true})).toBeVisible();}
  }
  await screenshot(page,`lifecycle-${example.id}-${width}-${mode}-after`,testInfo);
  if(example.once && !example.host){
   await expect.poll(()=>page.evaluate(()=>localStorage.getItem('DocsBot_fixture-bot_chatHistory')||'')).toContain('uiLifecycle');
   if(example.frozen)await page.evaluate(()=>{
    const key='DocsBot_fixture-bot_chatHistory';const data=JSON.parse(localStorage.getItem(key));
    for(const item of Object.values(data))if(item.generativeUI)item.uiReadOnly=true;
    localStorage.setItem(key,JSON.stringify(data));
   });
   await page.reload();
   const restored=page.getByRole('group',{name:'Generated interface'}).first();
   await expect(restored.getByRole('button',{name:example.button,exact:true})).toBeDisabled();
   if(example.form)await expect(restored.getByRole('textbox',{name:'Name',exact:true})).toHaveValue('Casey Demo');
   if(example.frozen){await expect(restored.getByRole('tab',{name:'Privacy notes'})).toBeDisabled();await restored.getByRole('tab',{name:'Privacy notes'}).dispatchEvent('click');expect(await page.evaluate(()=>window.fixtureRequests.length)).toBe(0);await screenshot(page,`lifecycle-${example.id}-${width}-${mode}-frozen`,testInfo);}
  }
  expect(network.liveApiRequests).toEqual([]);
 });
}

test('one-time group blocks same-tick double clicks and restores after explicit send failure',async({page})=>{
 await openFixture(page);await ask(page);await finish(page,payload(lifecycleChoices));
 const ui=page.getByRole('group',{name:'Generated interface'});
 await ui.getByRole('button',{name:'Request a demo',exact:true}).evaluate(button=>{button.click();button.click()});
 await expect.poll(()=>page.evaluate(()=>window.fixtureRequests.length)).toBe(2);
 await page.waitForTimeout(100);
 expect(await page.evaluate(()=>window.fixtureRequests.length)).toBe(2);
 await page.evaluate(()=>window.fixtureController.error(new Error('Synthetic network failure')));
 await expect(ui.locator('[data-action-status="retry"]')).toHaveCount(1);
 await expect(ui.getByRole('button',{name:'Maybe later',exact:true})).toBeEnabled();
});

test('invalid or nested action policies cannot produce actionable controls',async({page})=>{
 await openFixture(page);await ask(page);
 await finish(page,payload(`root = Stack([ActionGroup("outer", "once", [ActionGroup("inner", "repeatable", [Buttons([Button("Nested action")])], ${lifecycleLabels})], ${lifecycleLabels})])`));
 await expect(page.getByRole('button',{name:'Nested action',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>window.fixtureRequests.length)).toBe(1);
 const invalid=`root = Stack([ActionGroup("invalid", "unknown", [Buttons([Button("Invalid policy action")])], ${lifecycleLabels})])`;
 await page.evaluate(response=>DocsBotAI.addUIMessage({response}),invalid);
 const button=page.getByRole('button',{name:'Invalid policy action',exact:true});
 if(await button.count()){await expect(button).toBeDisabled();await button.dispatchEvent('click');}
 expect(await page.evaluate(()=>window.fixtureRequests.length)).toBe(1);
});
