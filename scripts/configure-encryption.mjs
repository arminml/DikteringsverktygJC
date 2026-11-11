import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// Explicit one-time local setup; never print the key or replace an existing one.
const path = new URL('../.env', import.meta.url);
let contents;
try { contents = readFileSync(path, 'utf8'); } catch { throw new Error('Skapa .env från .env.example först.'); }
const existing = contents.match(/^SETTINGS_ENCRYPTION_KEY=(.*)$/m);
if (existing?.[1].trim()) {
 console.log('Krypteringshemligheten är redan konfigurerad. Ingen ändring gjordes.');
} else {
 const setting = `SETTINGS_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`;
 contents = existing ? contents.replace(/^SETTINGS_ENCRYPTION_KEY=.*$/m, setting) : contents.trimEnd() + '\n' + setting + '\n';
 writeFileSync(path, contents, { mode: 0o600 });
 console.log('Kryptering konfigurerad i .env. Starta om servern.');
}
