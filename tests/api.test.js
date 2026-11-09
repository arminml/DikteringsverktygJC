import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('API: åtkomst, CSRF, elevflöde, historik och avstängda integrationer',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'korklar-api-')),origin='http://127.0.0.1:3199';
 const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,NODE_ENV:'production',PORT:'3199',HOST:'127.0.0.1',APP_ORIGIN:origin,DATABASE_PATH:join(dir,'db.sqlite'),PILOT_ACCESS_CODE:'test-code-at-least-16',OPENAI_API_KEY:'',SEND_ENABLED:'false'},stdio:'pipe'});
 try{
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Serverstart timeout')),10000);child.stdout.on('data',d=>{if(d.toString().includes('Körklar:')){clearTimeout(t);resolve();}});child.on('error',reject);child.on('exit',code=>{clearTimeout(t);reject(new Error('Server avslutades: '+code));});});
 let cookie='';const request=(path,body,method,override={})=>fetch(origin+'/api'+path,{method:method||(body?'POST':'GET'),headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...override},body:body?JSON.stringify(body):undefined});
 assert.equal((await request('/students')).status,401);
 assert.equal((await request('/access',{code:'test-code-at-least-16'},'POST',{Origin:'https://evil.example'})).status,403);
 assert.equal((await request('/access',{code:'wrong'})).status,401);
 const login=await request('/access',{code:'test-code-at-least-16'});assert.equal(login.status,200);assert.ok(login.headers.get('set-cookie').includes('HttpOnly'));cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/students',{name:'Erik Test',email:'bad',phone:''})).status,400);
 const created=await request('/students',{name:'Erik Test',email:'erik@example.com',phone:'070 123 45 67'});assert.equal(created.status,201);const student=await created.json();assert.equal(student.phone,'+46701234567');
 assert.equal((await request('/students/'+student.id,{name:'Erik Ny',email:'erik@example.com',phone:student.phone},'PUT')).status,200);
 const draft=await (await request('/feedback',{studentId:student.id,notes:'Öva filbyten',text:'Hej Erik! Öva filbyten.',channel:'sms',subject:'Feedback'})).json();
 assert.equal((await request('/feedback/'+draft.id+'/send',{confirm:false})).status,400);
 assert.equal((await request('/feedback/'+draft.id+'/send',{confirm:true})).status,503);
 const hist=await(await request('/history')).json();assert.equal(hist.length,1);assert.equal(hist[0].status,'draft');assert.equal(hist[0].name,'Erik Ny');
 assert.equal((await request('/generate',{studentId:student.id,notes:'Test',variant:'normal'})).status,503);
 assert.equal((await request('/students/'+student.id,undefined,'DELETE')).status,200);
 assert.deepEqual(await(await request('/history')).json(),[]);
 await request('/logout',{});assert.equal((await request('/students')).status,401);
 }finally{child.kill();await new Promise(resolve=>child.once('close',resolve));rmSync(dir,{recursive:true,force:true});}
});
