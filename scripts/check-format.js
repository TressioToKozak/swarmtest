'use strict';
const fs=require('node:fs');
const files=['account-store.js','server.js','account-client.js','test/progression-hardening.test.js'];
const failures=[];
for(const file of files){const source=fs.readFileSync(file,'utf8');if(source.includes('\r'))failures.push(`${file}: CRLF`);source.split('\n').forEach((line,index)=>{if(/[ \t]+$/.test(line))failures.push(`${file}:${index+1}: trailing whitespace`)})}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1}else console.log(`format check: ${files.length} files`);
