import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url);
const {parse}=require('@babel/parser');
const file=await fs.readFile('tests/openui/widget.openui.spec.mjs','utf8');
const ast=parse(file,{sourceType:'module'});
const declarations=new Map();let charts;
function visit(node){
 if(!node||typeof node!=='object')return;
 if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier')declarations.set(node.id.name,node.init);
 if(node.type==='ForOfStatement'&&node.body?.type==='BlockStatement'&&file.slice(node.start,node.end).includes('official ${name} chart'))charts=node.right;
 for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
}
visit(ast);
const origin=process.env.WIDGET_TEST_URL||'http://127.0.0.1:3005';
const context=vm.createContext({devOrigin:origin});
// Evaluate only known fixture constant initializers from our checked-in tests.
const names=['program','imageCards','formProgram','layout','controls','galleryPhoto','galleryCases','brandReviewProgram'];
for(const name of names){const node=declarations.get(name);if(!node)throw new Error('Missing fixture '+name);vm.runInContext(`var ${name} = ${file.slice(node.start,node.end)}`,context);}
if(!charts)throw new Error('Chart fixture catalogue missing');
const chartCases=vm.runInContext(file.slice(charts.start,charts.end),context);
const cases=[['core-report','Text, callout, metrics and table',context.program],['image-cards','Image card combinations',context.imageCards],['form','Validated text form',context.formProgram],['tabs-accordion','Tabs and accordion',context.layout],['selection-controls','All selection controls',context.controls],...Object.entries(context.galleryCases).map(([id,program])=>[id,id.replace(/([a-z])([A-Z])/g,'$1 $2'),program]),...chartCases.map(([id,chart])=>['chart-'+id,id+' chart',`root = Stack([Card([CardHeader("${id} chart"), ${chart}])])`]),['support-overview','Combined support overview',context.brandReviewProgram]];
const dir='output/playwright/openui-matrix';await fs.mkdir(dir,{recursive:true});
await fs.writeFile(dir+'/catalogue.json',JSON.stringify(cases,null,2));
const prefix=file.slice(0,file.indexOf("test('all six components"));
const spec=prefix+`\nimport {readFile} from 'node:fs/promises';\nconst matrixCases=JSON.parse(await readFile('output/playwright/openui-matrix/catalogue.json','utf8'));\nfor(const [id,title,program] of matrixCases)for(const size of ['narrow','wide'])for(const mode of ['light','dark']){\n test('component matrix '+id+' '+size+' '+mode,async({page})=>{\n  const network=await installFixture(page);\n  await page.goto('/__openui-fixture?theme='+mode);\n  await page.locator('main').evaluate((el,width)=>{el.style.maxWidth=width+'px';el.style.width=width+'px';},size==='narrow'?448:740);\n  await expect(page.getByRole('textbox',{name:'Send a message...'})).toBeVisible();await ask(page);await finish(page,payload(program));\n  const ui=page.getByRole('group',{name:'Generated interface'});await expect(ui).toBeVisible();\n  await ui.evaluate(el=>{for(let p=el;p;p=p.parentElement||p.getRootNode()?.host){p.style.height='auto';p.style.maxHeight='none';p.style.overflow='visible';}});\n  // A tall viewport paints all chart/image rows before capturing the complete widget.\n  const height=await ui.evaluate(el=>Math.ceil(el.scrollHeight));\n  await page.setViewportSize({width:1100,height:Math.min(14000,Math.max(1000,height+550))});\n  const wrapper=page.locator('.docsbot-chat-container');\n  await expect(ui).not.toBeEmpty();\n  if(id==='modal'){await expect(page.getByRole('dialog')).toBeVisible();await page.screenshot({path:'${dir}/'+id+'-'+size+'-'+mode+'.png',animations:'disabled'});}\n  else {await wrapper.screenshot({path:'${dir}/'+id+'-'+size+'-'+mode+'.png',animations:'disabled'});}\n  expect(network.liveApiRequests).toEqual([]);\n });\n}\n`;
const specPath='tests/openui/matrix.generated.spec.mjs';await fs.writeFile(specPath,spec);
const log=await fs.open('/tmp/docsbot-openui-component-matrix.log','w');
try{
 const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','--config','playwright.openui.config.mjs',specPath,'--workers=2','--reporter=list'],{stdio:['ignore',log.fd,log.fd]});
 const code=await new Promise(resolve=>child.on('exit',resolve));
 console.log('Captured',cases.length,'component combinations × 4 views; exit:',code);
 process.exitCode=code||0;
}finally{await fs.unlink(specPath);await log.close();}
