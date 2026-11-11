import test from 'node:test';
import assert from 'node:assert/strict';
import {generateForMode,localFeedback} from '../server/demo.js';

test('Lokal demoformatering bevarar anteckningarna utan nya faktapåståenden',async()=>{
 const input={name:'Sara Test',notes:'Ingen bedömning av parkering gjordes.\nÖva filbyte nästa gång.',variant:'normal'};
 const result=await generateForMode(input,{status:()=>({configured:false})},true);
 assert.equal(result.source,'local');assert.ok(result.text.endsWith(input.notes));assert.equal(result.text,localFeedback(input));assert.match(result.notice,/inte AI-genererad/);
});
test('Demoläge faller tillbaka vid AI-fel; riktigt läge döljer inte fel',async()=>{
 const store={status:()=>({configured:true}),active:()=>{throw new Error('Claude API-nyckeln är ogiltig.');}};
 const result=await generateForMode({name:'Erik',notes:'Öva filbyte.'},store,true);assert.equal(result.source,'local');assert.match(result.notice,/ogiltig/);
 await assert.rejects(()=>generateForMode({name:'Erik',notes:'Öva filbyte.'},store,false),/ogiltig/);
});
