import { SYSTEM_PROMPT } from './prompt.js';
export class ProviderError extends Error { constructor(message, uncertain=false){super(message);this.uncertain=uncertain;} }
async function request(url, options){
 let response;
 try { response=await fetch(url,{...options,signal:AbortSignal.timeout(60000)}); } catch {throw new ProviderError('Tjänsten svarade inte. Försök igen senare.',true);}
 if(!response.ok){
  if(url.startsWith('https://api.openai.com/')){
   const messages={401:'OpenAI API-nyckeln är ogiltig eller har återkallats. Kontrollera nyckeln och försök igen.',403:'API-nyckeln saknar behörighet för denna OpenAI-funktion.',404:'Den valda AI-modellen saknas eller är inte tillgänglig för nyckeln.',429:'OpenAI har nått en användningsgräns. Kontrollera saldo och gränser hos OpenAI eller försök senare.'};
   throw Object.assign(new ProviderError(messages[response.status]||'OpenAI kunde inte behandla begäran. Försök igen senare.',response.status>=500),{status:502});
  }
  throw new ProviderError(`Tjänsten avvisade begäran (HTTP ${response.status}). Kontrollera tjänstens inställningar.`,response.status>=500);
 }
 try{return await response.json();}catch{throw new ProviderError('Tjänsten gav ett oväntat svar.',true);}
}
const bearer = key=>({Authorization:`Bearer ${key}`});
export async function generate({name,notes,text,variant}, apiKey = process.env.OPENAI_API_KEY){
 const data=await request('https://api.openai.com/v1/responses',{method:'POST',headers:{...bearer(apiKey),'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_TEXT_MODEL||'gpt-4.1-mini',store:false,instructions:SYSTEM_PROMPT,input:JSON.stringify({förnamn:name.split(' ')[0],anteckningar:notes,tidigareMeddelande:text||'',variant}),max_output_tokens:1200})});
 const result=data.output?.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');
 if(!result || data.status==='incomplete')throw new Error('AI kunde inte skapa ett komplett meddelande. Dina anteckningar finns kvar.'); return result;
}
export async function transcribe(file, apiKey = process.env.OPENAI_API_KEY){const form=new FormData();form.append('file',new Blob([file.buffer],{type:file.mimetype}),file.mimetype.includes('mp4')?'recording.mp4':'recording.webm');form.append('model',process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-transcribe');form.append('language','sv');const data=await request('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:bearer(apiKey),body:form});if(!data.text?.trim())throw new Error('Inget tal kunde uppfattas. Spela in igen eller skriv anteckningarna.');return data.text;}
export async function testConnection(apiKey){
 const data=await request('https://api.openai.com/v1/responses',{method:'POST',headers:{...bearer(apiKey),'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_TEXT_MODEL||'gpt-4.1-mini',input:'Svara endast OK.',max_output_tokens:16,store:false})});
 if(data.status!=='completed'||!data.output?.some(item=>item.content?.some(c=>c.type==='output_text'&&c.text)))throw Object.assign(new Error('OpenAI svarade men testet kunde inte slutföras. Kontrollera modellinställningen.'),{status:502});
}
export async function send(row){
 if(row.channel==='sms') {const data=await request(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:row.recipient,From:process.env.TWILIO_FROM,Body:row.text})});if(!data.sid)throw new ProviderError('SMS-tjänsten saknade kvittens.',true);return data.sid;}
 const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const data=await request('https://api.resend.com/emails',{method:'POST',headers:{...bearer(process.env.RESEND_API_KEY),'Content-Type':'application/json','Idempotency-Key':row.id},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[row.recipient],subject:row.subject,text:row.text,html:`<div style="font-family:Arial,sans-serif;max-width:580px;margin:32px auto;line-height:1.7;color:#25334a"><p style="color:#3167cf;font-weight:bold">Feedback från din körlektion</p><div style="white-space:pre-wrap">${escape(row.text)}</div></div>`})});if(!data.id)throw new ProviderError('Mejltjänsten saknade kvittens.',true);return data.id;
}
