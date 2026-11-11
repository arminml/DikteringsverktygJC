import test from 'node:test';
import assert from 'node:assert/strict';
import {claudeError,listClaudeModels,resolveClaudeModel} from '../server/claude.js';

test('Claude skiljer kreditfel, nyckelfel, arbetsyta, modellfel och begränsningar utan att läcka råa fel',()=>{
 for(const [status,message,code] of [[400,'Your credit balance is too low','claude_billing'],[400,'spend limit reached','claude_billing'],[401,'sk-secret','claude_auth'],[404,'sk-secret','claude_model'],[403,'sk-secret','claude_permission'],[429,'too many requests','claude_rate_limit'],[529,'overloaded','claude_unavailable'],[400,'anthropic-workspace-id required','claude_workspace']]){
 const result=claudeError({status,error:{error:{message}}});assert.equal(result.code,code);assert.ok(!result.message.includes('sk-secret'));assert.equal(result.status,502);
 }
});
test('Claude verifierar API-ID och översätter endast entydiga visningsnamn mot riktig SDK-modellista (isolerad transport)',async()=>{
 const original=global.fetch;try{
 global.fetch=async(url,options)=>{assert.ok(String(url).startsWith('https://api.anthropic.com/v1/models'));assert.equal(new Headers(options.headers).get('Authorization'),'Bearer secret-key');return Response.json({data:[{id:'claude-opus-5-5',display_name:'Claude Opus 5.5',type:'model'}],has_more:false,first_id:'claude-opus-5-5',last_id:'claude-opus-5-5'});};
 assert.equal((await listClaudeModels('secret-key'))[0].id,'claude-opus-5-5');
 assert.equal(await resolveClaudeModel('secret-key','Opus 5.5'),'claude-opus-5-5');
 await assert.rejects(()=>resolveClaudeModel('secret-key','okänd modell'),e=>e.code==='claude_model');
 global.fetch=async()=>Response.json({type:'error',error:{type:'not_found_error',message:'model not found'}},{status:404});
 await assert.rejects(()=>resolveClaudeModel('secret-key','claude-unknown'),e=>e.code==='claude_model');
 }finally{global.fetch=original;}
});
