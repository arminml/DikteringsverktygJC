import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createAiSettings } from '../server/ai-settings.js';
import { testConnection } from '../server/providers.js';

test('AI-nyckel krypteras, överlever omstart, byts och tas bort utan fallback', () => {
 const dir=mkdtempSync(join(tmpdir(),'ai-settings-')),path=join(dir,'db.sqlite');
 const env={SETTINGS_ENCRYPTION_KEY:'a1'.repeat(32),OPENAI_API_KEY:'sk-environment-old-key'};
 const secret='sk-test-secret-that-must-not-be-stored-in-plaintext';
 let db=openDb(path);
 try {
  let store=createAiSettings(db,env);
  assert.equal(store.status().source,'environment');
  store.save(secret);
  assert.equal(store.getKey(),secret);
  assert.deepEqual(store.status(),{configured:true,source:'database',storageReady:true});
  const first=db.prepare('SELECT * FROM ai_settings').get();
  assert.ok(!JSON.stringify(first).includes(secret));
  store.save(secret);
  assert.notEqual(db.prepare('SELECT iv FROM ai_settings').get().iv,first.iv);
  db.close();db=openDb(path);store=createAiSettings(db,env);
  assert.equal(store.getKey(),secret);
  assert.ok(!readFileSync(path).includes(Buffer.from(secret)));
  assert.throws(()=>createAiSettings(db,{SETTINGS_ENCRYPTION_KEY:'b2'.repeat(32)}).getKey(),/kunde inte läsas säkert/);
  db.prepare("UPDATE ai_settings SET tag='AAAAAAAAAAAAAAAAAAAAAA=='").run();
  assert.throws(()=>store.getKey(),/kunde inte läsas säkert/);
  store.save('sk-replacement-key-for-this-test');assert.equal(store.getKey(),'sk-replacement-key-for-this-test');
  store.remove();assert.equal(store.getKey(),'');assert.equal(store.status().configured,false);
  assert.equal(db.prepare('SELECT ciphertext FROM ai_settings').get().ciphertext,null);
  assert.throws(()=>store.save('invalid'),/giltig OpenAI/);
  assert.throws(()=>createAiSettings(db,{}).save(secret),/Säker lagring/);
 } finally { db.close();rmSync(dir,{recursive:true,force:true}); }
});

test('Anslutningstest: säkra svenska fel utan hemligheter, timeout och ofullständigt svar', async () => {
 const original=global.fetch;
 try {
  for(const [status,pattern] of [[401,/ogiltig/],[403,/behörighet/],[404,/modellen/],[429,/användningsgräns/],[500,/senare/]]){
   global.fetch=async()=>Response.json({error:{message:'sk-do-not-leak-provider-echo'}},{status});
   await assert.rejects(()=>testConnection('sk-test'),e=>pattern.test(e.message)&&!e.message.includes('sk-')&&e.status===502);
  }
  global.fetch=async()=>{throw new Error('sk-network-secret');};
  await assert.rejects(()=>testConnection('sk-test'),e=>!e.message.includes('sk-')&&/svarade inte/.test(e.message));
  global.fetch=async()=>Response.json({status:'incomplete',output:[]});
  await assert.rejects(()=>testConnection('sk-test'),/kunde inte slutföras/);
 } finally { global.fetch=original; }
});
