import test from 'node:test'
import assert from 'node:assert/strict'
import {decodeAnswerDelta} from './answerDelta.mjs'
test('JSON SSE envelopes preserve leading blank lines, spaces and escapes',()=>{
 for(const delta of ['\n','\ncard = Card([])','  ','\\','"','日本語','root = Stack(']) assert.equal(decodeAnswerDelta(JSON.stringify({delta})),delta)
 assert.equal(decodeAnswerDelta('root = Stack('),'')
})
