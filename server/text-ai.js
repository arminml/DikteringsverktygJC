import { SYSTEM_PROMPT } from './prompt.js';
import { claudeText, resolveClaudeModel } from './claude.js';

export async function completeText(connection,input,testing=false){
 const {provider,base,apiKey,model}=connection;
 const anthropic=provider==='anthropic',openai=provider==='openai';
 const system=testing?'Svara kort med OK.':SYSTEM_PROMPT;
 if(anthropic){const canonical=await resolveClaudeModel(apiKey,model);return claudeText({...connection,model:canonical},input,system,testing);}
 const headers={'Content-Type':'application/json',...(anthropic?{'x-api-key':apiKey,'anthropic-version':'2023-06-01'}:{Authorization:`Bearer ${apiKey}`})};
 const body=openai?{model,instructions:system,input,store:false,max_output_tokens:testing?64:1200}:anthropic?{model,system,messages:[{role:'user',content:input}],max_tokens:testing?64:1200}:{model,messages:[{role:'system',content:system},{role:'user',content:input}],max_tokens:testing?64:1200};
 let response;
 try{response=await fetch(base+(openai?'/responses':anthropic?'/messages':'/chat/completions'),{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(60000)});}catch{throw Object.assign(new Error('AI-tjänsten svarade inte. Kontrollera anslutningen och försök igen.'),{status:502});}
 if(!response.ok){const messages={401:'API-nyckeln är ogiltig eller har återkallats hos den valda leverantören.',403:'API-nyckeln saknar behörighet för modellen.',404:'Modellen eller API-adressen hittades inte. Kontrollera modellens ID.',429:'AI-tjänstens användningsgräns har nåtts. Kontrollera saldo och gränser.'};throw Object.assign(new Error(messages[response.status]||`AI-tjänsten kunde inte behandla begäran (HTTP ${response.status}). Kontrollera modell och inställningar.`),{status:502});}
 let data;try{data=await response.json();}catch{throw Object.assign(new Error('AI-tjänsten gav ett ogiltigt svar.'),{status:502});}
 const result=openai?data.output?.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n'):anthropic?data.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n'):data.choices?.[0]?.message?.content;
 const truncated=openai?data.status==='incomplete':anthropic?data.stop_reason==='max_tokens':data.choices?.[0]?.finish_reason==='length';
 if(typeof result!=='string'||!result.trim()||truncated)throw Object.assign(new Error('AI-tjänsten kunde inte skapa ett komplett textsvar. Dina anteckningar finns kvar.'),{status:502});
 return result;
}
export function generateFeedback(data,connection){return completeText(connection,JSON.stringify({förnamn:data.name.split(' ')[0],anteckningar:data.notes,tidigareMeddelande:data.text||'',variant:data.variant}));}
