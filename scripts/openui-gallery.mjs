import fs from 'node:fs/promises';
import path from 'node:path';
import {componentNames} from '../src/components/generativeUi/contract.mjs';
const source=path.resolve('output/playwright/openui');
const target=path.resolve('public/openui-gallery');
const groups=[
 ...['teal','purple','yellow','white','black','red'].flatMap(brand=>['light','dark'].map(mode=>[`${brand} brand · ${mode}`,`brand-${brand}-${mode}`,''])),
 ['Narrow floating · light','brand-floating-light',''],['Narrow floating · dark','brand-floating-dark',''],
 ['Mobile cards','brand-mobile-cards',''],['Mobile form · light','brand-mobile-form-light',''],['Mobile form · dark','brand-mobile-form-dark',''],
 ['Disabled while streaming','brand-disabled-streaming',''],['Secondary hover','brand-secondary-hover',''],['Keyboard focus','brand-keyboard-focus',''],
 ['Typography, callouts, tags and metrics','catalogue-typography','CardHeader TextContent MarkDownRenderer InlineHeader Label Text BoldText Callout TextCallout CodeBlock Separator TagBlock Tag Icon IconText MetricIndicatorInline MetricIndicatorWithStrikethrough Stack'],
 ['Images and image text','catalogue-imagery','Image ImageBlock ImageGallery ImageText ImageTextLarge'],
 ['Tables, lists and steps','catalogue-structured','Steps StepsItem EntityList ListBlock ListItem EditableTable'],
 ['Snippet and overview cards','catalogue-snippetOverview','SnippetCardItem SnippetCardBlock OverviewCardItem OverviewCardBlock'],
 ['Context and visual cards','catalogue-contextVisual','ContextCardItem ContextCardBlock VisualCardItem VisualCardBlock'],
 ['Composite cards','catalogue-composite','CompositeCardItem CompositeCardBlock'],
 ['Carousel, cards and buttons','catalogue-carouselButtons','Carousel Card Buttons Button IconButton'],
 ['Modal dialog','catalogue-modal','Modal'],
 ['Form validation and text fields','official-form','Form FormControl Input TextArea'],
 ['Selection and date controls','official-selection-controls','Select SelectItem DatePicker Slider CheckBoxGroup CheckBoxItem RadioGroup RadioItem SwitchGroup SwitchItem Chips ChipItem OptionCards OptionCard'],
 ['Tabs and accordion','official-local-layout-controls','Tabs TabItem Accordion AccordionItem'],
 ['Read-only table and ordinary answer','all-components','Table Col'],
 ...['bar','line','area','horizontal-bar','pie','donut','radar','radial','stacked-bar','scatter'].map((name,i)=>[`${name} chart`,`chart-${name}`,['BarChart Series','LineChart','AreaChart','HorizontalBarChart','PieChart','','RadarChart','RadialChart','SingleStackedBarChart','ScatterChart ScatterSeries Point'][i]]),
 ['Image cards in light theme','official-image-cards',''],['Image cards in dark theme','dark-image-cards',''],['Mobile image cards','mobile-image-cards',''],
];
await fs.mkdir(target,{recursive:true});
const previews=new Map();
for(const [,file] of groups){
 await fs.copyFile(path.join(source,file+'.png'),path.join(target,file+'.png'));
 try{await fs.copyFile(path.join(source,file+'-surface.png'),path.join(target,file+'-surface.png'));previews.set(file,file+'-surface');}catch{previews.set(file,file);}
}
let baselineAvailable=true;
for(const file of ['official-form','mobile-image-cards']){try{await fs.copyFile(path.resolve('output/playwright/openui-before',file+'.png'),path.join(target,'before-'+file+'.png'));}catch{baselineAvailable=false;}}
const mapping=new Map();groups.forEach(([title,file,names])=>names.split(' ').filter(Boolean).forEach(name=>mapping.set(name,{title,file})));
const uncovered=componentNames.filter(name=>!mapping.has(name)&&name!=='Slice');
if(uncovered.length)throw new Error('Missing component screenshots: '+uncovered.join(', '));
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DocsBot · OpenUI component screenshots</title><style>body{margin:0;background:#f1f5f9;color:#172a3b;font:16px/1.5 system-ui}main{max-width:1440px;margin:auto;padding:32px}h1{margin-bottom:4px}p{max-width:90ch}nav{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}nav a{background:white;padding:4px 10px;border-radius:20px;color:#075985;font-size:13px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px;align-items:start}article{background:white;border:1px solid #d8e2eb;border-radius:14px;overflow:hidden;scroll-margin:20px}h2{font-size:18px;padding:16px;margin:0}article p{font-size:13px;padding:0 16px;color:#526579}img{width:100%;height:auto;display:block}article img{padding:14px} .comparison{display:grid;grid-template-columns:1fr 1fr;gap:20px}.comparison img{padding:0}.comparison a{display:block} .comparison h3{padding:12px;margin:0}a{color:#036381}details{background:white;padding:16px;border-radius:12px;margin:20px 0}li{margin:3px 0}@media(max-width:600px){main{padding:14px}section,.comparison{display:block}article{margin-bottom:18px}}</style><main><h1>OpenUI components in the DocsBot widget</h1><p>Actual widget screenshots with the official 0.18.1 component set and styles. Brand colors now drive primary, secondary, links, focus, selections and charts. Widget-matched font stack, 14px body, 13px labels and 15px card headings. Neutral text, restrained surfaces and consistent spacing remain readable in light/dark themes. Generated interfaces sit outside the answer bubble. Fictional fixtures only; external requests blocked. Click an image for its full-resolution screenshot.</p><p>82 registered component names: 81 represented by rendered controls or their parent components below. <strong>Slice</strong> is an upstream data descriptor whose render function returns null; it has no standalone visual appearance. Other descriptors (Series, Point, Col and item components) appear through their parent chart, table, list or control.</p><nav><a href="#before-after">Before / after</a>${groups.map(([title,file])=>`<a href="#${file}">${escape(title)}</a>`).join('')}</nav><details><summary>Component index (82 names)</summary><ul>${componentNames.map(name=>{const item=mapping.get(name);return `<li>${item?`<a href="#${item.file}">${name}</a> — ${escape(item.title)}`:`${name} — data descriptor; renders no standalone UI`}</li>`}).join('')}</ul></details>${baselineAvailable?`<h2 id="before-after">Before / after</h2><p>Same form and mobile card fixtures, captured in the actual widget. Current preview tiles below show the generated surface; click for the full widget screenshot.</p><div class="comparison"><article><h3>Before · unbranded form</h3><a href="before-official-form.png"><img src="before-official-form.png" alt="Form before styling"></a></article><article><h3>After · widget brand and cleaner form</h3><a href="official-form.png"><img src="official-form.png" alt="Branded form after styling"></a></article><article><h3>Before · cramped mobile columns</h3><a href="before-mobile-image-cards.png"><img loading="lazy" src="before-mobile-image-cards.png" alt="Mobile cards before styling"></a></article><article><h3>After · single column</h3><a href="brand-mobile-cards.png"><img loading="lazy" src="brand-mobile-cards.png" alt="Mobile cards after styling"></a></article></div>`: ''}<h2>Brand matrix and full component grid</h2><section>${groups.map(([title,file,names])=>`<article id="${file}"><h2>${escape(title)}</h2>${names?`<p>${names}</p>`:''}<a href="${file}.png" target="_blank" rel="noopener"><img loading="lazy" src="${previews.get(file)}.png" alt="${escape(title)} rendered in DocsBot widget"></a></article>`).join('')}</section></main></html>`;
await fs.writeFile(path.join(target,'index.html'),html);
console.log(`Gallery: ${groups.length} widget screenshots; ${mapping.size}/82 names visually represented, Slice is nonvisual.`);
