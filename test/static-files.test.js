'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createStaticHandler,publicFiles}=require('../server');

const multiplayerRuntimeFiles=['shared-collision.js','multiplayer-socket-state.js','multiplayer-client-utils.js','multiplayer.js','multiplayer-visual-state.js','multiplayer-game.js'];

test('HTTP server serves every multiplayer runtime JavaScript file',async t=>{
  const server=http.createServer(createStaticHandler());
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  for(const file of multiplayerRuntimeFiles){
    assert.equal(publicFiles.has(file),true,`${file} must be present in publicFiles`);
    const response=await new Promise((resolve,reject)=>http.get(`http://127.0.0.1:${server.address().port}/${file}`,resolve).once('error',reject));
    const body=await new Promise((resolve,reject)=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.once('end',()=>resolve(Buffer.concat(chunks)));response.once('error',reject)});
    assert.equal(response.statusCode,200,`${file} should return HTTP 200`);
    assert.match(response.headers['content-type']||'',/^text\/javascript(?:;|$)/,`${file} should use a JavaScript content type`);
    assert.ok(body.length>0,`${file} should have a non-empty body`);
  }
});

test('malformed percent encoding returns 400 without escaping the static handler',async t=>{
  const server=http.createServer(createStaticHandler());
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await new Promise((resolve,reject)=>http.get(`http://127.0.0.1:${server.address().port}/%E0%A4%A`,resolve).once('error',reject));
  response.resume();assert.equal(response.statusCode,400);
});
