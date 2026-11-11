// Exercises the same authenticated endpoints as the UI against a running local server.
// Creates and removes only its own synthetic test student; sends no SMS or email.
const origin=process.env.APP_ORIGIN||'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('Detta test är endast avsett för localhost.');
let cookie='',studentId;
async function call(path,body,method){const r=await fetch(origin+'/api'+path,{method:method||(body?'POST':'GET'),headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});const data=await r.json();if(!r.ok)throw new Error(data.error||'HTTP-test misslyckades.');if(path==='/access')cookie=r.headers.get('set-cookie').split(';')[0];return data;}
try{
 await call('/access',{code:process.env.PILOT_ACCESS_CODE});
 const state=await call('/settings/providers');if(state.provider!=='anthropic')throw new Error('Claude måste vara aktiv för testet.');
 const models=await call('/settings/providers/anthropic/models',{});
 if(!models.models.some(m=>m.id===state.model))throw new Error('Sparad modell finns inte i modellistan.');
 const result=await call('/settings/providers/anthropic/test',{model:state.model});
 console.log(JSON.stringify({connectionTest:result.ok,model:result.model,response:result.text}));
 const student=await call('/students',{name:'Tillfällig Claude-test',phone:'',email:''});studentId=student.id;
 const generated=await call('/generate',{studentId,notes:'Eleven planerade körningen bättre idag. Behöver öva döda vinkeln vid filbyte. Nästa lektion fokuserar vi på filbyten.',variant:'normal'});
 if(!generated.text?.trim()||generated.source!=='ai')throw new Error(generated.notice||'Ingen AI-genererad feedback returnerades.');
 console.log(JSON.stringify({feedbackEndpoint:'passed',text:generated.text,syntheticInput:true}));
}catch(error){console.log(JSON.stringify({result:'failed',message:error.message}));process.exitCode=1;}
finally{if(studentId){await call('/students/'+studentId,undefined,'DELETE');console.log('Tillfällig test-elev raderad.');}if(cookie)await call('/logout',{});}
