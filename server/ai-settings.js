import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const error = (message, status = 503) => Object.assign(new Error(message), { status });
export function validateApiKey(value) {
 if (typeof value !== 'string' || !/^sk-[A-Za-z0-9_-]{16,500}$/.test(value.trim())) {
  throw error('Ange en giltig OpenAI API-nyckel som börjar med sk-.', 400);
 }
 return value.trim();
}

// A separate deployment secret, never stored alongside the encrypted database value.
export function createAiSettings(db, env = process.env) {
 const org = 'pilot';
 const aad = Buffer.from(`korklar:openai:v1:${org}`);
 const row = () => db.prepare('SELECT * FROM ai_settings WHERE org_id=?').get(org);
 function encryptionKey() {
  if (!/^[a-fA-F0-9]{64}$/.test(env.SETTINGS_ENCRYPTION_KEY || '')) {
   throw error('Säker lagring är inte konfigurerad. Ange SETTINGS_ENCRYPTION_KEY på servern enligt README.');
  }
  return Buffer.from(env.SETTINGS_ENCRYPTION_KEY, 'hex');
 }
 return {
  status() {
   const saved = row();
   return { configured: saved ? !!saved.ciphertext : !!env.OPENAI_API_KEY,
    source: saved ? (saved.ciphertext ? 'database' : null) : env.OPENAI_API_KEY ? 'environment' : null,
    storageReady: /^[a-fA-F0-9]{64}$/.test(env.SETTINGS_ENCRYPTION_KEY || '') };
  },
  getKey() {
   const saved = row();
   if (!saved) return env.OPENAI_API_KEY || '';
   if (!saved.ciphertext) return ''; // Removal also disables legacy environment fallback.
   const key = encryptionKey();
   try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(saved.iv, 'base64'));
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(saved.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(saved.ciphertext, 'base64')), decipher.final()]).toString('utf8');
   } catch {
    throw error('Den sparade API-nyckeln kunde inte läsas säkert. Kontrollera serverns krypteringsnyckel eller spara en ny API-nyckel.');
   }
  },
  save(value) {
   const apiKey = validateApiKey(value);
   const key = encryptionKey(), iv = randomBytes(12);
   const cipher = createCipheriv('aes-256-gcm', key, iv);
   cipher.setAAD(aad);
   const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
   db.prepare(`INSERT INTO ai_settings(org_id,ciphertext,iv,tag) VALUES(?,?,?,?)
    ON CONFLICT(org_id) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,tag=excluded.tag`)
    .run(org, ciphertext.toString('base64'), iv.toString('base64'), cipher.getAuthTag().toString('base64'));
  },
  remove() {
   db.prepare(`INSERT INTO ai_settings(org_id) VALUES(?) ON CONFLICT(org_id)
    DO UPDATE SET ciphertext=NULL,iv=NULL,tag=NULL`).run(org);
  }
 };
}
