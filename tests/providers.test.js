import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDb} from '../server/db.js';
import {connectionStore} from '../server/provider-settings.js';
import {completeText,generateFeedback} from '../server/text-ai.js';

test('Leverantörsnycklar separeras, krypteras och kan bytas utan att ändra ljudtjänsten',()=>{
 const dir=mkdtempSync(join(tmpdir(),'providers-')),db=openDb(join(dir,'db.sqlite'));
 try{const store=connectionStore(db,{SETTINGS_ENCRYPTION_KEY:'ab'.repeat(32),OPENAI_API_KEY:'sk-existing-openai-key'});
 store.save('anthropic',{apiKey:'anthropic-test-secret',model:'claude-test'});
 assert.equal(store.active().apiKey,'anthropic-test-secret');assert.equal(store.transcriptionKey(),'sk-existing-openai-key');
 assert.ok(!JSON.stringify(store.status()).includes('secret'));assert.ok(!JSON.stringify(db.prepare('SELECT * FROM ai_connections').all()).includes('secret'));
 store.save('gemini',{apiKey:'google-test-secret-key',model:'gemini-test',activate:false});assert.equal(store.active().provider,'anthropic');
 assert.throws(()=>store.prepare('openrouter',{model:'test'}),/API-nyckel/);
 store.save('gemini',{model:'gemini-test'});assert.equal(store.active().apiKey,'google-test-secret-key');
 store.remove('anthropic');assert.equal(store.active().provider,'gemini');
 store.remove('openai');assert.throws(()=>store.transcriptionKey(),/separat OpenAI/);assert.equal(store.status().configured,true);
 assert.throws(()=>store.save('compatible',{apiKey:'custom-test-secret-key',model:'model'}),/AI_COMPATIBLE_BASE_URL/);
 assert.throws(()=>store.save('invalid',{apiKey:'test',model:'model'}),/leverantör/);
 db.prepare("UPDATE ai_connections SET provider='anthropic' WHERE provider='gemini'").run();assert.throws(()=>store.prepare('anthropic',{model:'test'}),/läsas säkert/);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('Claude, Gemini, OpenRouter, OpenAI och kompatibla tjänster får rätt autentisering och API-format',async()=>{
 const original=global.fetch;
 try{for(const provider of ['anthropic','gemini','openrouter','openai','compatible']){
 global.fetch=async(url,options)=>{url=String(url);if(provider==='anthropic'&&url.includes('/models/'))return Response.json({id:'claude-test',display_name:'Claude Test',type:'model'});const body=JSON.parse(options.body);assert.equal(options.redirect,'error');assert.equal(body.model,provider==='anthropic'?'claude-test':'selected-model');
 if(provider==='anthropic'){assert.ok(url.endsWith('/messages'));const headers=new Headers(options.headers);assert.equal(headers.get('Authorization'),'Bearer provider-only-secret');assert.equal(headers.get('x-api-key'),null);assert.ok(headers.get('anthropic-version'));assert.ok(body.system);return Response.json({content:[{type:'text',text:'Hej!'}],stop_reason:'end_turn'});}
 assert.equal(options.headers.Authorization,'Bearer provider-only-secret');assert.equal(options.headers['x-api-key'],undefined);
 if(provider==='openai'){assert.ok(url.endsWith('/responses'));assert.equal(body.store,false);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'Hej!'}]}]});}
 assert.ok(url.endsWith('/chat/completions'));assert.equal(body.messages[0].role,'system');return Response.json({choices:[{message:{content:'Hej!'},finish_reason:'stop'}]});};
 assert.equal(await generateFeedback({name:'Test Elev',notes:'Anteckningar',variant:'normal'},{provider,model:provider==='anthropic'?'claude-test':'selected-model',apiKey:'provider-only-secret',base:'https://example.com/v1'}),'Hej!');
 }
 global.fetch=async()=>Response.json({error:{message:'do-not-leak-secret'}},{status:401});await assert.rejects(()=>completeText({provider:'anthropic',base:'https://api.anthropic.com/v1',model:'model',apiKey:'secret'},'test',true),e=>/ogiltig/.test(e.message)&&!e.message.includes('secret'));
 global.fetch=async(url)=>String(url).includes('/models/')?Response.json({id:'claude-test',type:'model',display_name:'Claude Test'}):Response.json({content:[{type:'text',text:'partial'}],stop_reason:'max_tokens'});await assert.rejects(()=>completeText({provider:'anthropic',base:'https://api.anthropic.com/v1',model:'claude-test',apiKey:'secret'},'test'),/komplett/);
 }finally{global.fetch=original;}
});
