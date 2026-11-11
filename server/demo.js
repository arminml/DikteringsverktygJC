import {randomUUID} from 'node:crypto';
import {generateFeedback} from './text-ai.js';

export function seedDemoStudents(db){
 if(db.prepare("SELECT COUNT(*) AS n FROM students WHERE org_id='pilot'").get().n)return;
 const insert=db.prepare("INSERT INTO students VALUES(?,'pilot',?,?,?)");
 db.exec('BEGIN');try{for(const [name,email,phone] of [['Erik Demo','erik@example.invalid','+46701234567'],['Sara Demo','sara@example.invalid','+46702345678'],['Alex Demo','alex@example.invalid','+46703456789']])insert.run(randomUUID(),name,email,phone);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
export function localFeedback({name,notes}){
 // Only wrap the original text. Do not summarize, infer progress, or invent next steps.
 return `Hej ${name.trim().split(/\s+/)[0]}!\n\nHär är anteckningarna från din körlektion:\n\n${notes.trim()}`;
}
export async function generateForMode(data,connections,demo){
 if(!demo)return {text:await generateFeedback(data,connections.active()),source:'ai'};
 if(!connections.status().configured)return {text:localFeedback(data),source:'local',notice:'Lokalt formaterad feedback – inte AI-genererad. Ingen AI-nyckel är konfigurerad. Originalanteckningarna har bevarats.'};
 try{return {text:await generateFeedback(data,connections.active()),source:'ai'};}
 catch(error){return {text:localFeedback(data),source:'local',notice:`Lokalt formaterad feedback – inte AI-genererad. ${error.message} Originalanteckningarna har bevarats.`};}
}
