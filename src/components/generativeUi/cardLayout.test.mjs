import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardColumns, isCardCollection, minimumCardWidth } from './cardLayout.mjs'
test('invoice rows wrap against their actual width and requested maximum',()=>{
 for(const [width,max,expected] of [[540,8,2],[390,8,1],[320,8,1],[120,8,1],[2000,2,2],[2000,1,1],[NaN,8,1],[540,Infinity,1]]) assert.equal(cardColumns(width,max),expected)
})
test('only card rows qualify, with compact metrics distinct from details',()=>{
 const node=(typeName,props={})=>({type:'element',typeName,props})
 const cards=[node('Card',{children:[node('MetricIndicatorInline')]}),node('Card',{children:[node('MetricIndicatorInline')]})]
 assert.equal(isCardCollection({direction:'row',children:cards}),true)
 assert.equal(isCardCollection({direction:'row',children:[...cards,null]}),true)
 assert.equal(minimumCardWidth(cards),160)
 assert.equal(minimumCardWidth([...cards,node('Card',{children:[node('TextContent')]})]),240)
 assert.equal(isCardCollection({direction:'row',children:[...cards,node('Table')]}),false)
})
