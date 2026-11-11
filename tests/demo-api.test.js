import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Hela demoflödet utan API-nycklar: elever, lokal feedback, redigering, SMS/mejl, omladdning och omstart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'korklar-demo-')),origin='http://127.0.0.1:3201';let child,cookie='';
 async function start(demo){child=spawn(process.execPath,['--import','./tests/fixtures/no-network.mjs','server/index.js'],{env:{...process.env,NODE_ENV:'production',PORT:'3201',HOST:'127.0.0.1',APP_ORIGIN:origin,DATABASE_PATH:join(dir,'demo.sqlite'),DEMO_MODE:String(demo),PILOT_ACCESS_CODE:'demo-test-code-long-enough',OPENAI_API_KEY:'',SEND_ENABLED:'true',TWILIO_ACCOUNT_SID:'test',TWILIO_AUTH_TOKEN:'test',TWILIO_FROM:'+46701234567',RESEND_API_KEY:'test',EMAIL_FROM:'demo@example.invalid'},stdio:'pipe'});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Serverstart timeout')),30000);child.stdout.on('data',data=>{if(data.toString().includes('Körklar:')){clearTimeout(timer);resolve();}});child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server avslutades: '+code));});});}
 async function stop(){if(child&&child.exitCode===null){const done=new Promise(resolve=>child.once('close',resolve));child.kill();await done;}}
 async function call(path,body,method){const response=await fetch(origin+'/api'+path,{method:method||(body?'POST':'GET'),headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await response.json();if(path==='/access')cookie=response.headers.get('set-cookie').split(';')[0];return {response,data};}
 try{
  await start(true);await call('/access',{code:'demo-test-code-long-enough'});
  const config=(await call('/config')).data;assert.equal(config.demo,true);assert.equal(config.ai,false);assert.equal(config.sending,false);
  const students=(await call('/students')).data;assert.equal(students.length,3);
  const student=students[0];const updated={name:'Fiktiv Testelev',phone:student.phone,email:'test@example.invalid'};
  assert.equal((await call('/students/'+student.id,updated,'PUT')).response.status,200);
  const generated=(await call('/generate',{studentId:student.id,notes:'Öva kontroll av döda vinkeln. Nästa lektion: filbyte.',variant:'normal'})).data;
  assert.equal(generated.source,'local');assert.match(generated.notice,/inte AI-genererad/);assert.ok(generated.text.includes('Öva kontroll av döda vinkeln.'));
  const final=generated.text+'\nLärarens manuella tillägg.';let pending;
  for(const channel of ['sms','email']){
   const saved=(await call('/feedback',{studentId:student.id,notes:'Öva kontroll av döda vinkeln. Nästa lektion: filbyte.',text:final,channel,subject:'Testlektion',source:'local'})).data;
   const results=await Promise.all([call('/feedback/'+saved.id+'/send',{confirm:true}),call('/feedback/'+saved.id+'/send',{confirm:true})]);
   for(const {data} of results){assert.equal(data.status,'simulated');assert.equal(data.provider_id,null);assert.equal(data.student_id,student.id);assert.equal(data.text,final);}
  }
  pending=(await call('/feedback',{studentId:student.id,notes:'Anteckningar',text:'Sparat demoutkast',channel:'email',subject:'Utkast',source:'local'})).data.id;
  await call('/logout',{});await call('/access',{code:'demo-test-code-long-enough'});
  let history=(await call('/history')).data;assert.equal(history.length,3);assert.equal(history.filter(h=>h.status==='simulated').length,2);assert.ok(history.every(h=>h.demo_mode===1&&h.generation_source==='local'&&!Number.isNaN(Date.parse(h.created_at))));
  await stop();await start(true);await call('/access',{code:'demo-test-code-long-enough'});
  assert.equal((await call('/students')).data.length,3);assert.equal((await call('/history')).data.length,3);
  await stop();await start(false);await call('/access',{code:'demo-test-code-long-enough'});
  assert.equal((await call('/feedback/'+pending+'/send',{confirm:true})).response.status,409);
  history=(await call('/history')).data;assert.equal(history.filter(h=>h.status==='simulated').length,2);
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
