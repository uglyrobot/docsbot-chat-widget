import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve('public/openui-gallery/actions');
await mkdir(output,{recursive:true});
const views=[];
for(const width of [448,900]) for(const mode of ['light','dark']) {
 const filename=`submission-${width}-${mode}.png`;
 await copyFile(path.resolve('output/playwright/openui',filename),path.join(output,filename));
 views.push(`<section><h2>${width===448?'Narrow':'Wide'} · ${mode}</h2><a href="${filename}"><img src="${filename}" alt="Submitted form and expandable user turn in ${mode} mode" loading="lazy"></a></section>`);
}
await writeFile(path.join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenUI form submissions</title><style>body{font:15px system-ui;margin:24px;color:#172033;background:#eef2f6}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}section{min-width:0}img{max-width:100%;height:auto;border:1px solid #ccd5e0;border-radius:12px}a{color:#0e7490}</style><h1>Form submission previews</h1><p>Actual widget captures: the submitted action remains in history with expandable field values. Synthetic fixture data only.</p><p><a href="../combos/index.html">All component combinations</a></p><main>${views.join('')}</main></html>`);
console.log('Generated http://localhost:3005/openui-gallery/actions/index.html');
