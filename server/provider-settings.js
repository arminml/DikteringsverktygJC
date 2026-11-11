import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createAiSettings } from './ai-settings.js';

export const CATALOG = [
 {id:'openai',name:'OpenAI',base:'https://api.openai.com/v1',example:'gpt-4.1-mini'},
 {id:'anthropic',name:'Claude (Anthropic)',base:'https://api.anthropic.com/v1',example:'Ange Claude-modellens ID'},
 {id:'gemini',name:'Gemini (Google)',base:'https://generativelanguage.googleapis.com/v1beta/openai',example:'Ange Gemini-modellens ID'},
 {id:'openrouter',name:'OpenRouter',base:'https://openrouter.ai/api/v1',example:'leverantör/modell'},
 {id:'compatible',name:'Annan OpenAI-kompatibel tjänst',example:'Ange modellens ID'}
];
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function connectionStore(db,env=process.env){
 const legacy=createAiSettings(db,env);
 function catalog(){return CATALOG.map(({base,...p})=>({...p,available:p.id!=='compatible'||!!env.AI_COMPATIBLE_BASE_URL}));}
 function provider(id){const p=CATALOG.find(p=>p.id===id);if(!p)throw fail('Välj en giltig AI-leverantör.');return p;}
 function key(){if(!/^[a-f\d]{64}$/i.test(env.SETTINGS_ENCRYPTION_KEY||''))throw fail('Serverns kryptering är inte konfigurerad.',503);return Buffer.from(env.SETTINGS_ENCRYPTION_KEY,'hex');}
 function row(id){return db.prepare("SELECT * FROM ai_connections WHERE org_id='pilot' AND provider=?").get(id);}
 function getKey(id){provider(id);const r=row(id);if(!r)return id==='openai'?legacy.getKey():'';try{const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(r.iv,'base64'));decipher.setAAD(Buffer.from(`korklar:provider:pilot:${id}`));decipher.setAuthTag(Buffer.from(r.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(r.ciphertext,'base64')),decipher.final()]).toString('utf8');}catch{throw fail('Den sparade nyckeln kunde inte läsas säkert. Spara nyckeln igen eller kontrollera serverns kryptering.',503);}}
 function hasKey(id){return !!row(id)||(id==='openai'&&legacy.status().configured);}
 function validateKey(value){if(typeof value!=='string'||value.trim().length<16||value.trim().length>2048||/\s/.test(value.trim()))throw fail('Ange en giltig API-nyckel från den valda leverantören.');return value.trim();}
 function model(value){if(typeof value!=='string'||!value.trim()||value.length>200||/[\r\n]/.test(value))throw fail('Ange modellens ID hos leverantören.');return value.trim();}
 function config(id,modelId,apiKey){const p=provider(id);const base=p.base||env.AI_COMPATIBLE_BASE_URL;if(!base)throw fail('Ange AI_COMPATIBLE_BASE_URL på servern för den egna tjänsten.',503);const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw fail('Den egna tjänsten måste ha en HTTPS-basadress utan inloggningsuppgifter, frågesträng eller fragment.',503);return {provider:id,model:model(modelId),apiKey:apiKey===undefined?getKey(id):validateKey(apiKey),base:base.replace(/\/+$/,'')};}
 function preference(){return db.prepare("SELECT provider,model FROM ai_preferences WHERE org_id='pilot'").get()||{provider:'openai',model:env.OPENAI_TEXT_MODEL||'gpt-4.1-mini'};}
 return {
  status(){const active=preference();return {...active,configured:hasKey(active.provider),transcriptionConfigured:hasKey('openai'),storageReady:legacy.status().storageReady,providers:catalog().map(p=>({...p,configured:hasKey(p.id)}))};},
  active(){const active=preference();const result=config(active.provider,active.model);if(!result.apiKey)throw fail('Konfigurera en API-nyckel under AI-inställningar.',503);return result;},
  transcriptionKey(){const result=getKey('openai');if(!result)throw fail('Diktering behöver en separat OpenAI-nyckel under AI-inställningar. Du kan fortfarande skriva anteckningar och använda vald textleverantör.',503);return result;},
  prepare(id,body){const result=config(id,body.model,body.apiKey);if(!result.apiKey)throw fail('Ange eller spara en API-nyckel före anslutningstestet.');return result;},
  save(id,body){
   const result=config(id,body.model,body.apiKey);if(!result.apiKey)throw fail('Ange en API-nyckel.');
   // Each provider has its own encrypted key. Changing provider never reuses another provider's key.
   if(body.apiKey!==undefined){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(`korklar:provider:pilot:${id}`));const encrypted=Buffer.concat([cipher.update(result.apiKey,'utf8'),cipher.final()]);db.prepare("INSERT INTO ai_connections VALUES('pilot',?,?,?,?) ON CONFLICT(org_id,provider) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,tag=excluded.tag").run(id,encrypted.toString('base64'),iv.toString('base64'),cipher.getAuthTag().toString('base64'));}
   if(body.activate!==false)db.prepare("INSERT INTO ai_preferences VALUES('pilot',?,?) ON CONFLICT(org_id) DO UPDATE SET provider=excluded.provider,model=excluded.model").run(id,result.model);
  },
  remove(id){provider(id);db.prepare("DELETE FROM ai_connections WHERE org_id='pilot' AND provider=?").run(id);if(id==='openai')legacy.remove();},
 };
}
