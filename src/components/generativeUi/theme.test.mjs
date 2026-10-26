import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenUITheme,contrast} from './theme.mjs';
for(const mode of ['light','dark'])for(const brand of ['#0e7490','#7c3aed','#facc15','#ffffff','#000000','#ef4444','rgb(18,146,238)','invalid']){
 test(`${mode} ${brand} uses readable brand tokens`,()=>{
  const t=createOpenUITheme(brand,mode);
  assert.ok(contrast(t.interactiveAccentDefault,t.textAccentPrimary)>=4.5);
  assert.ok(contrast(t.interactiveAccentHover,t.textAccentPrimary)>=4.5);
  for(const surface of [t.background,t.foreground,t.highlight])assert.ok(contrast(t.textBrand,surface)>=4.5,`${t.textBrand} on ${surface}`);
  assert.ok(contrast(t.textNeutralPrimary,t.foreground)>=4.5);
  assert.ok(contrast(t.textNeutralSecondary,t.foreground)>=4.5);
  assert.ok(contrast(t.interactiveAccentDefault,t.foreground)>=3);
  assert.equal(t.defaultChartPalette[Math.floor(t.defaultChartPalette.length/2)],t.interactiveAccentDefault);
 });
}

test('widget typography stays compact and uses its native stack',()=>{
 const t=createOpenUITheme('#0e7490');
 assert.ok(t.fontBody.startsWith('-apple-system'));
 assert.ok(t.textBodyDefault.includes('14px/'));
 assert.ok(t.textLabelDefault.includes('13px/'));
 assert.ok(t.textHeadingXs.includes('15px/'));
 assert.ok(t.textHeadingXl.includes('22px/'));
 assert.equal(t.fontBody,t.fontHeading);
});
