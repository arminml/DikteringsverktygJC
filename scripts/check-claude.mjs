// Real Anthropic calls. No fixtures, no student records and no keys in output.
// Run: node --env-file=.env scripts/check-claude.mjs [--repair-model] [--generate]
import {DatabaseSync} from 'node:sqlite';
import {connectionStore} from '../server/provider-settings.js';
import {listClaudeModels,resolveClaudeModel,claudeText} from '../server/claude.js';
import {generateFeedback} from '../server/text-ai.js';
const db=new DatabaseSync(process.env.DATABASE_PATH||'./data/korklar.sqlite');
try{
 const store=connectionStore(db),state=store.status();
 if(state.provider!=='anthropic')throw new Error('Claude är inte aktiv leverantör. Välj och spara Claude i AI-inställningar.');
 const connection=store.active();
 console.log(JSON.stringify({configured:true,decryptionOk:!!connection.apiKey,savedModel:connection.model}));
 const models=await listClaudeModels(connection.apiKey);
 console.log(JSON.stringify({availableModels:models.map(m=>m.id)}));
 const canonical=await resolveClaudeModel(connection.apiKey,connection.model);
 console.log(JSON.stringify({validatedModel:canonical}));
 if(process.argv.includes('--repair-model')&&canonical!==connection.model){store.save('anthropic',{model:canonical});console.log('Det sparade visningsnamnet har ersatts med Anthropics verifierade API-ID.');}
 connection.model=canonical;
 const answer=await claudeText(connection,'Svara endast OK.','Du testar en API-anslutning.',true);
 console.log(JSON.stringify({connectionTest:'passed',response:answer}));
 if(process.argv.includes('--generate')){
  const text=await generateFeedback({name:'Testeleven',notes:'Eleven planerade körningen bättre idag. Behöver öva kontroll av döda vinkeln vid filbyte. Nästa lektion fokuserar vi på filbyten.',variant:'normal'},connection);
  console.log(JSON.stringify({feedbackTest:'passed',syntheticInput:true,text}));
 }
}catch(error){console.log(JSON.stringify({result:'failed',code:error.code||'configuration',message:error.message}));process.exitCode=1;}finally{db.close();}
