'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');

const ACCOUNT_PROGRESS_KEYS=Object.freeze([
  'swarmfall-stats','swarmfall-achievements-v1','swarmfall-unlocked','swarmfall-modes',
  'swarmfall-nightmare-cosmetic','swarmfall-save-v1','swarmfall-character','swarmfall-map','swarmfall-mode'
]);
const ACCOUNT_PROGRESS_KEY_SET=new Set(ACCOUNT_PROGRESS_KEYS);

function emptyDatabase(){return{users:[],sessions:{}}}
function validDatabase(value){return Boolean(value&&Array.isArray(value.users)&&value.sessions&&typeof value.sessions==='object'&&!Array.isArray(value.sessions))}
function normalizeLogin(value){return String(value||'').trim().toLowerCase()}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(error,key)=>error?reject(error):resolve({salt,hash:key.toString('hex')})))}
function passwordMatches(password,user){return new Promise(resolve=>crypto.scrypt(password,user.passwordSalt,64,(error,key)=>{if(error)return resolve(false);try{resolve(crypto.timingSafeEqual(Buffer.from(user.passwordHash,'hex'),key))}catch{resolve(false)}}))}
function cleanProgress(progress){return Object.fromEntries(Object.entries(progress||{}).filter(([key,value])=>ACCOUNT_PROGRESS_KEY_SET.has(key)&&typeof value==='string'&&value.length<800000))}

class AccountStore{
  constructor(file){this.file=file;this.data=null;this.queue=Promise.resolve()}
  async load(){if(this.data)return this.data;try{const raw=await fs.readFile(this.file,'utf8'),parsed=JSON.parse(raw);if(!validDatabase(parsed))throw new Error('Nieprawidłowa struktura bazy kont.');this.data=parsed;for(const user of this.data.users){user.progress=cleanProgress(user.progress);user.revision=Number.isSafeInteger(user.revision)&&user.revision>=0?user.revision:0}return this.data}catch(error){if(error.code==='ENOENT'){this.data=emptyDatabase();return this.data}const controlled=new Error('Baza kont jest uszkodzona lub niedostępna.');controlled.code='ACCOUNT_STORE_CORRUPTED';controlled.cause=error;throw controlled}}
  run(operation){const task=this.queue.then(async()=>operation(await this.load()));this.queue=task.catch(()=>{});return task}
  async persist(){await fs.mkdir(path.dirname(this.file),{recursive:true});const temporary=`${this.file}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;await fs.writeFile(temporary,JSON.stringify(this.data));await fs.rename(temporary,this.file)}
  read(operation){return this.run(data=>operation(data))}
  mutate(operation){return this.run(async data=>{const result=await operation(data);await this.persist();return result})}
}

module.exports={AccountStore,ACCOUNT_PROGRESS_KEYS,ACCOUNT_PROGRESS_KEY_SET,normalizeLogin,hashPassword,passwordMatches,cleanProgress};
