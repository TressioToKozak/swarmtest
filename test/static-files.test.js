'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createStaticHandler,publicFiles}=require('../server');

const multiplayerRuntimeFiles=['shared-collision.js','multiplayer-socket-state.js','multiplayer-client-utils.js','multiplayer.js','multiplayer-visual-state.js','multiplayer-game.js'];
async function get(port,pathname){return new Promise((resolve,reject)=>http.get({host:'127.0.0.1',port,path:pathname},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.once('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));response.once('error',reject)}).once('error',reject))}

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

test('HTTP server safely serves Scout PNG assets and keeps its public allowlist',async t=>{
  const server=http.createServer(createStaticHandler());
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});t.after(()=>new Promise(resolve=>server.close(resolve)));
  const port=server.address().port,scout=await get(port,'/assets/heroes/scout/scout_idle.png');
  assert.equal(scout.status,200);assert.match(scout.headers['content-type']||'',/^image\/png(?:;|$)/);assert.ok(scout.body.length>0);
  for(const file of['/game.js','/style.css'])assert.equal((await get(port,file)).status,200,file);
  assert.equal((await get(port,'/does-not-exist')).status,404);
  for(const traversal of['/assets/../server.js','/assets/%2e%2e/server.js']){const response=await get(port,traversal);assert.notEqual(response.status,200,traversal);assert.doesNotMatch(response.body.toString(),/class GameServer/)}
});

test('logout action is hidden outside menu surfaces',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','style.css'),'utf8');
  assert.ok(css.includes('#multiplayerModal:not(.hidden))) #accountLogoutBtn{display:none}'));
});
