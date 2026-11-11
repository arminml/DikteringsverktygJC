// Live localhost workflow, with synthetic inputs only. Never contacts SMS/email providers.
// Refuses to run unless the server explicitly reports DEMO_MODE=true.
const origin=process.env.APP_ORIGIN||'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('Testet kräver localhost.');
let cookie='',studentId;
async function call(path,body,method){const response=await fetch(origin+'/api'+path,{method:method||(body?'POST':'GET'),headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(150000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'HTTP-testet misslyckades.');if(path==='/access')cookie=response.headers.get('set-cookie').split(';')[0];return data;}
try{
 await call('/access',{code:process.env.PILOT_ACCESS_CODE});
 const config=await call('/config');if(!config.demo)throw new Error('Servern är inte i demoläge. Testet avbryts utan utskick.');
 const student=await call('/students',{name:'Tillfällig Demotest',phone:'070 123 45 67',email:'demo-test@example.invalid'});studentId=student.id;
 const notes='Eleven planerade körningen bättre idag. Behöver öva döda vinkeln vid filbyte. Nästa lektion fokuserar vi på filbyten.';
 const generated=await call('/generate',{studentId,notes,variant:'normal'});if(!generated.text||!['ai','local'].includes(generated.source))throw new Error('Feedbackresultatet är ofullständigt.');
 console.log(JSON.stringify({generation:generated.source,feedbackReturned:true,...(generated.notice?{notice:generated.notice}:{})}));
 const edited=generated.text+'\n\nManuellt tillägg i demotestet.';const ids=[];
 for(const channel of ['sms','email']){
  const draft=await call('/feedback',{studentId,notes,text:edited,source:generated.source,channel,subject:'Demotest'});ids.push(draft.id);
  const result=await call('/feedback/'+draft.id+'/send',{confirm:true});if(result.status!=='simulated'||result.provider_id)throw new Error('Utskicket markerades inte korrekt som simulerat.');
  console.log(JSON.stringify({channel,status:result.status,externalDelivery:false}));
 }
 await call('/logout',{});await call('/access',{code:process.env.PILOT_ACCESS_CODE});
 const history=await call('/history');for(const id of ids){const row=history.find(h=>h.id===id);if(!row||row.student_id!==studentId||row.text!==edited||row.status!=='simulated')throw new Error('Historiken stämmer inte efter ny session.');}
 console.log('Historik, elevkoppling och redigerad text verifierade efter ny session.');
}catch(error){console.log(JSON.stringify({result:'failed',message:error.message}));process.exitCode=1;}
finally{if(studentId){await call('/students/'+studentId,undefined,'DELETE');console.log('Egna tillfälliga testuppgifter borttagna.');}if(cookie)await call('/logout',{});}
