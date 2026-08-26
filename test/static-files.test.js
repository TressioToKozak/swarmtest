'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createStaticHandler,publicFiles}=require('../server');

async function get(port,pathname){return new Promise((resolve,reject)=>http.get({host:'127.0.0.1',port,path:pathname},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.once('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));response.once('error',reject)}).once('error',reject))}

test('HTTP server serves every local JavaScript referenced by index.html',async t=>{
  const server=http.createServer(createStaticHandler());
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const root=path.join(__dirname,'..'),htmlResponse=await get(server.address().port,'/index.html');
  assert.equal(htmlResponse.status,200,'index.html should return HTTP 200');
  const sources=[...htmlResponse.body.toString('utf8').matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match=>match[1]).filter(source=>!/^https?:|^\/\//i.test(source));
  assert.ok(sources.length>0,'index.html should reference local runtime scripts');
  const files=sources.map(source=>source.split(/[?#]/,1)[0].replace(/^\.\//,''));
  assert.equal(new Set(files).size,files.length,'local runtime scripts should not be registered twice');
  for(let index=0;index<sources.length;index++){
    const source=sources[index],file=files[index];
    assert.equal(path.extname(file),'.js',`${source} should be a JavaScript resource`);
    assert.equal(fs.existsSync(path.join(root,file)),true,`${file} must exist on disk`);
    assert.equal(publicFiles.has(file),true,`${file} must be present in publicFiles`);
    const response=await get(server.address().port,`/${source}`);
    assert.equal(response.status,200,`${source} should return HTTP 200`);
    assert.match(response.headers['content-type']||'',/^text\/javascript(?:;|$)/,`${source} should use a JavaScript content type`);
    assert.ok(response.body.length>0,`${source} should have a non-empty body`);
  }
  const before=(dependency,consumer)=>assert.ok(files.indexOf(dependency)>=0&&files.indexOf(dependency)<files.indexOf(consumer),`${dependency} must load before ${consumer}`);
  for(const dependency of['shared-game-data.js','shared-mechanics.js','shared-map-data.js','shared-collision.js','asset-gate.js','nav-prewarm-policy.js','spatial-grid.js','map-data.js','map-visuals.js','enemy-visuals.js'])before(dependency,'game.js');
  for(const dependency of['game.js','multiplayer-socket-state.js','multiplayer-client-utils.js','multiplayer.js','multiplayer-visual-state.js'])before(dependency,'multiplayer-game.js');
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
