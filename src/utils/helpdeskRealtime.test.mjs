import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHelpdeskRealtime } from './helpdeskRealtime.mjs';
function clock() {
  let time = 1700000000000, serial = 0; const tasks = new Map();
  return { now:()=>time, setTimeout(fn,ms) { const id=++serial; tasks.set(id,{at:time+ms,fn}); return id; }, clearTimeout(id) { tasks.delete(id); }, async advance(ms) { const end=time+ms; while (true) { const next=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0]; if (!next || next[1].at>end) break; time=next[1].at; tasks.delete(next[0]); next[1].fn(); await flush(); } time=end; await flush(); }, pending:()=>tasks.size };
}
const flush = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };
function setup(overrides={}) {
  const timer=clock(), sockets=[], requests=[], listeners=new Map(); let grants=0;
  const doc={hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)};
  const stop = startHelpdeskRealtime({ timers:timer, now:timer.now, random:()=>0.5, documentRef:doc,
    retryBaseMs:10,retryMaxMs:100,fallbackBaseMs:20,fallbackMaxMs:80,disabledRetryMs:500,connectTimeoutMs:50,heartbeatIntervalMs:100000,heartbeatTimeoutMs:10,
    getGrant:async()=>{ grants++; return {enabled:true,url:'wss://gateway.example/connect',token:`token${grants}`,expiresAt:timer.now()+60000}; },
    refresh:async()=>{requests.push('refresh');}, socketFactory:(url,protocols)=>{const socket={url,protocols,close(){this.closed=true;},send(value){this.lastSent=value;},pong(){this.onmessage?.({data:'pong'});},message(frame){this.onmessage?.({data:JSON.stringify(frame)});},fail(){this.onclose?.();}};sockets.push(socket);return socket;},
    ...overrides });
  return {timer,sockets,requests,doc,listeners,stop,grants:()=>grants};
}
test('ready and invalidations coalesce without losing an update during a snapshot', async () => {
  let release; let calls=0; const f=setup({refresh:async()=>{calls++; if(calls===1) await new Promise(r=>{release=r;});}});
  await flush(); assert.equal(f.sockets.length,1);
  assert.deepEqual(f.sockets[0].protocols,['docsbot.helpdesk.v1','grant.token1']);
  f.sockets[0].message({v:1,type:'ready'}); f.sockets[0].message({v:1,type:'invalidate'}); f.sockets[0].message({v:1,type:'invalidate'});
  release(); await flush(); assert.equal(calls,2);
  await f.timer.advance(1000); assert.equal(calls,2, 'healthy idle socket does not poll'); f.stop();
});
test('disconnect recovers using a fresh grant and snapshot; visibility refreshes', async () => {
  const f=setup(); await flush(); f.sockets[0].message({v:1,type:'ready'}); await flush();
  const before=f.requests.length; f.sockets[0].fail(); await f.timer.advance(10); assert.equal(f.grants(),2); assert.equal(f.sockets.length,2);
  f.sockets[1].message({v:1,type:'ready'}); await flush(); assert.ok(f.requests.length>before);
  const after=f.requests.length; f.doc.hidden=false; f.listeners.get('visibilitychange')(); await flush(); assert.equal(f.requests.length,after+1);
  f.stop(); assert.equal(f.listeners.size,0); assert.equal(f.sockets[1].closed,true); const count=f.requests.length; await f.timer.advance(1000); assert.equal(f.requests.length,count);
});
test('disabled gateway uses adaptive snapshots without repeated grant requests', async () => {
  let grantCalls=0; const f=setup({getGrant:async()=>{grantCalls++;return {enabled:false};}}); await flush();
  await f.timer.advance(200); assert.equal(grantCalls,1); assert.ok(f.requests.length>=3); assert.ok(f.requests.length<=5);
  await f.timer.advance(300); assert.equal(grantCalls,2); f.stop();
});
test('stopping during grant prevents opening a socket or running late snapshots', async () => {
  let resolveGrant; const f=setup({getGrant:()=>new Promise(r=>{resolveGrant=r;})}); await flush(); f.stop();
  resolveGrant({enabled:true,url:'wss://gateway.example/connect',token:'secret',expiresAt:f.timer.now()+60000}); await flush();
  assert.equal(f.sockets.length,0); await f.timer.advance(1000); assert.equal(f.requests.length,1);
});
test('lease expiry renews using a new grant and handshake timeout falls back', async () => {
  const f=setup(); await flush(); f.sockets[0].message({type:'ready',v:1}); await flush();
  await f.timer.advance(55000); assert.equal(f.grants(),2); assert.equal(f.sockets[0].closed,true);
  await f.timer.advance(50); assert.equal(f.sockets[1].closed,true); await f.timer.advance(10); assert.equal(f.grants(),3); f.stop();
});

test('silent half-open sockets reconnect while hidden tabs suspend heartbeat deadlines', async () => {
  const f=setup({heartbeatIntervalMs:30, heartbeatTimeoutMs:10}); await flush();
  const socket=f.sockets[0]; socket.message({type:'ready',v:1}); await flush();
  await f.timer.advance(30); assert.equal(socket.lastSent,'ping');
  f.doc.hidden=true; f.listeners.get('visibilitychange')(); await f.timer.advance(100); assert.equal(socket.closed,undefined);
  f.doc.hidden=false; f.listeners.get('visibilitychange')(); await f.timer.advance(30); assert.equal(socket.lastSent,'ping');
  socket.pong(); await f.timer.advance(30); assert.equal(socket.closed,undefined);
  await f.timer.advance(10); assert.equal(socket.closed,true);
  await f.timer.advance(10); assert.equal(f.grants(),2); f.stop();
});
