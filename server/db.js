import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export function openDb(path) {
 mkdirSync(dirname(path),{recursive:true}); const db=new DatabaseSync(path);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS organizations(id TEXT PRIMARY KEY, name TEXT NOT NULL);
 INSERT OR IGNORE INTO organizations VALUES('pilot','Pilotskolan');
 CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), teacher_id TEXT, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE, created_at TEXT NOT NULL, notes TEXT NOT NULL, text TEXT NOT NULL, channel TEXT NOT NULL, subject TEXT NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', error TEXT, provider_id TEXT);
 CREATE INDEX IF NOT EXISTS feedback_student ON feedback(org_id,student_id,created_at);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
 UPDATE feedback SET status='unknown',error='Servern startades om under utskicket. Kontrollera leverantören innan ett nytt utskick.' WHERE status='sending';`);
 return db;
}
