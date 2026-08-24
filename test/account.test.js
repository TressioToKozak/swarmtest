'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createStaticHandler}=require('../server');

function request(port,method,url,body,cookie){return new Promise((resolve,reject)=>{const raw=body===undefined?'':JSON.stringify(body),req=http.request({host:'127.0.0.1',port,method,path:url,headers:{'content-type':'application/json','content-length':Buffer.byteLength(raw),...(cookie?{cookie}:{})}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString()),cookie:res.headers['set-cookie']?.[0]?.split(';')[0]}))});req.on('error',reject);req.end(raw)})}

test('account registration, login and cloud progress persist on the server',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'swarm-account-')),accountFile=path.join(directory,'accounts.json'),server=http.createServer(createStaticHandler({accountFile}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const port=server.address().port;
  const short=await request(port,'POST','/api/account/register',{login:'gracz',email:'g@example.com',password:'1234567'});assert.equal(short.status,400);assert.match(short.body.error,/8 znaków/);
  const registered=await request(port,'POST','/api/account/register',{login:'Gracz_1',email:'g@example.com',password:'12345678'});assert.equal(registered.status,201);assert.ok(registered.cookie.startsWith('swarm_session='));
  const duplicate=await request(port,'POST','/api/account/register',{login:'gracz_1',email:'other@example.com',password:'12345678'});assert.equal(duplicate.status,409);
  const saved=await request(port,'PUT','/api/account/progress',{progress:{'swarmfall-stats':'{"coins":12}','unrelated':'ignored'}},registered.cookie);assert.equal(saved.status,200);
  const me=await request(port,'GET','/api/account/me',undefined,registered.cookie);assert.equal(me.status,200);assert.deepEqual(me.body.progress,{'swarmfall-stats':'{"coins":12}'});
  const login=await request(port,'POST','/api/account/login',{identifier:'G@EXAMPLE.COM',password:'12345678'});assert.equal(login.status,200);assert.deepEqual(login.body.progress,me.body.progress);
});

test('account endpoints reject unauthenticated progress access',async t=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'swarm-account-')),server=http.createServer(createStaticHandler({accountFile:path.join(directory,'accounts.json')}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const response=await request(server.address().port,'PUT','/api/account/progress',{progress:{}});assert.equal(response.status,401)});
