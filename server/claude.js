import Anthropic from '@anthropic-ai/sdk';

const failure=(message,code)=>Object.assign(new Error(message),{status:502,code});
export function claudeError(error){
 // Classify provider details internally; never return its raw message or request to the client.
 const detail=String(error?.error?.error?.message||error?.error?.message||'').toLowerCase();
 if(error?.status===401)return failure('Claude API-nyckeln är ogiltig, utgången eller återkallad. Använd en API-nyckel från Anthropic Console.','claude_auth');
 if([400,402,429].includes(error?.status)&&/credit|balance|billing|spend limit|usage limit/.test(detail))return failure('Anthropic saknar API-krediter eller har nått en utgiftsgräns. Kontrollera Billing och Limits i Anthropic Console. En Claude-chattprenumeration ersätter inte API-krediter.','claude_billing');
 if(error?.status===403)return failure('Claude-nyckeln saknar behörighet. Kontrollera projekt, arbetsyta och modellåtkomst i Anthropic Console.','claude_permission');
 if(error?.status===404)return failure('Claude-modellen hittades inte eller är inte tillgänglig. Hämta modeller och välj ett giltigt API-modell-ID i AI-inställningar.','claude_model');
 if(error?.status===429)return failure('Anthropics anropsgräns har nåtts. Vänta en stund och försök igen.','claude_rate_limit');
 if(error?.status===529||error?.status>=500)return failure('Claude-tjänsten är tillfälligt överbelastad eller otillgänglig. Försök igen senare.','claude_unavailable');
 if(error?.status===400&&/workspace/.test(detail))return failure('Anthropic kräver en arbetsyta för nyckeln. Ange ANTHROPIC_WORKSPACE_ID på servern och starta om.','claude_workspace');
 if(error instanceof Anthropic.APIConnectionError)return failure('Kunde inte ansluta till Anthropic. Kontrollera nätverk, brandvägg och att api.anthropic.com är tillgänglig.','claude_network');
 return failure('Claude kunde inte behandla begäran. Kontrollera API-modell och konto i Anthropic Console.','claude_request');
}
function client(apiKey){return new Anthropic({apiKey,baseURL:'https://api.anthropic.com',maxRetries:0,timeout:60000,logLevel:'off',fetchOptions:{redirect:'error'},defaultHeaders:process.env.ANTHROPIC_WORKSPACE_ID?{'anthropic-workspace-id':process.env.ANTHROPIC_WORKSPACE_ID}:undefined});}
export async function listClaudeModels(apiKey){
 try{const models=[];for await(const model of client(apiKey).models.list({limit:100})){models.push({id:model.id,name:model.display_name});if(models.length>=500)break;}if(!models.length)throw failure('Anthropic returnerade inga tillgängliga modeller för nyckeln.','claude_model');return models;}
 catch(e){if(e.code?.startsWith('claude_'))throw e;throw claudeError(e);}
}
export async function resolveClaudeModel(apiKey,value){
 const requested=String(value||'').trim();
 if(!requested)throw failure('Välj en Claude-modell från modellistan.','claude_model');
 try{
  // Canonical IDs and supported aliases are validated by Anthropic, not hard-coded guesses.
  if(/^claude-[a-z0-9-]+$/.test(requested)){const model=await client(apiKey).models.retrieve(requested);return model.id;}
  const normalized=s=>s.toLowerCase().replace(/^claude\s*/,'').replace(/[^a-z0-9]/g,'');
  const matches=(await listClaudeModels(apiKey)).filter(m=>normalized(m.name)===normalized(requested));
  if(matches.length===1)return matches[0].id;
  throw failure('Ange inte ett visningsnamn som ”Opus 5.5”. Hämta modeller och välj modellens exakta API-ID.','claude_model');
 }catch(e){if(e.code?.startsWith('claude_'))throw e;throw claudeError(e);}
}
export async function claudeText(connection,input,system,testing=false){
 try{
  const message=await client(connection.apiKey).messages.create({model:connection.model,system,messages:[{role:'user',content:input}],max_tokens:testing?128:1600});
  const text=message.content.filter(block=>block.type==='text').map(block=>block.text).join('\n').trim();
  if(!text||message.stop_reason!=='end_turn')throw failure('Claude gav inget komplett textmeddelande. Dina anteckningar finns kvar. Försök igen.','claude_incomplete');
  return text;
 }catch(e){if(e.code?.startsWith('claude_'))throw e;throw claudeError(e);}
}
