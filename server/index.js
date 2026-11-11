import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { randomBytes,randomUUID,createHash,timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { openDb } from './db.js';
import { studentSchema,feedbackSchema,phone } from './validation.js';
import * as providers from './providers.js';
import { createAiSettings, validateApiKey } from './ai-settings.js';
import { connectionStore } from './provider-settings.js';
import { completeText, generateFeedback } from './text-ai.js';
import { listClaudeModels, resolveClaudeModel } from './claude.js';
import { generateForMode, seedDemoStudents } from './demo.js';
const app=express(),db=openDb(process.env.DATABASE_PATH||'./data/korklar.sqlite');
const aiSettings=createAiSettings(db);
const connections=connectionStore(db);
const demo=process.env.DEMO_MODE==='true';
if(demo)seedDemoStudents(db);
const production=process.env.NODE_ENV==='production';
const origin=process.env.APP_ORIGIN||'http://localhost:3000';
const hash=s=>createHash('sha256').update(s).digest('hex');
app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:production?undefined:false}));app.use(express.json({limit:'64kb'}));
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');if(!['GET','HEAD'].includes(req.method)&&req.get('origin')!==origin)return res.status(403).json({error:'Begäran kom från en otillåten adress.'});next();});
app.use('/api',rateLimit({windowMs:60000,limit:100,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'För många anrop. Vänta en minut.'}}));
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
app.post('/api/access',rateLimit({windowMs:15*60000,limit:8,legacyHeaders:false,message:{error:'För många försök. Vänta 15 minuter.'}}),(req,res)=>{
 const secret=process.env.PILOT_ACCESS_CODE;if(!secret||secret.length<16)throw fail('Pilotåtkomst är inte konfigurerad. Ange PILOT_ACCESS_CODE med minst 16 tecken i .env.',503);
 if(typeof req.body.code!=='string'||!timingSafeEqual(Buffer.from(hash(req.body.code)),Buffer.from(hash(secret))))throw fail('Åtkomstkoden stämmer inte.',401);
 const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?)').run(hash(token),Date.now()+8*3600000);
 res.cookie('pilot',token,{httpOnly:true,secure:production,sameSite:'strict',maxAge:8*3600000,path:'/'}).json({ok:true});
});
app.use('/api',(req,res,next)=>{const token=req.headers.cookie?.split('; ').find(c=>c.startsWith('pilot='))?.slice(6);if(!token||!db.prepare('SELECT token FROM sessions WHERE token=? AND expires>?').get(hash(token),Date.now()))return res.status(401).json({error:'Öppna pilotåtkomsten för att fortsätta. Dina texter finns kvar.'});req.token=token;next();});
app.post('/api/logout',(req,res)=>{db.prepare('DELETE FROM sessions WHERE token=?').run(hash(req.token));res.clearCookie('pilot',{path:'/'}).json({ok:true});});
const configured=()=>({demo,transcription:connections.status().transcriptionConfigured,ai:connections.status().configured,sms:!!(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_FROM),email:!!(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM),sending:!demo&&process.env.SEND_ENABLED==='true'});
app.get('/api/config',(req,res)=>res.json(configured()));
app.get('/api/settings/providers',(req,res)=>res.json(connections.status()));
app.put('/api/settings/providers/:provider',async(req,res)=>{const body={...req.body};if(req.params.provider==='anthropic'){const connection=connections.prepare('anthropic',body);body.model=await resolveClaudeModel(connection.apiKey,body.model);}connections.save(req.params.provider,body);res.json(connections.status());});
app.post('/api/settings/providers/anthropic/models',rateLimit({windowMs:60000,limit:10,legacyHeaders:false,message:{error:'För många modellhämtningar. Vänta en minut.'}}),async(req,res)=>{const connection=connections.prepare('anthropic',{...req.body,model:'list-models'});res.json({models:await listClaudeModels(connection.apiKey)});});
app.delete('/api/settings/providers/:provider',(req,res)=>{connections.remove(req.params.provider);res.json(connections.status());});
app.post('/api/settings/providers/:provider/test',rateLimit({windowMs:60000,limit:5,legacyHeaders:false,message:{error:'För många anslutningstester. Vänta en minut.'}}),async(req,res)=>{
 const connection=connections.prepare(req.params.provider,req.body||{});
 if(connection.provider==='anthropic')connection.model=await resolveClaudeModel(connection.apiKey,connection.model);
 const text=await completeText(connection,'Svara OK.',true);
 res.json({ok:true,model:connection.model,text,message:'Anslutningen fungerar. Vald leverantör och modell har besvarat ett riktigt texttest.'});
});
// All settings routes are behind the same server session and Origin checks as AI usage.
app.get('/api/settings/ai',(req,res)=>res.json(aiSettings.status()));
app.put('/api/settings/ai',(req,res)=>{aiSettings.save(req.body?.apiKey);res.json(aiSettings.status());});
app.delete('/api/settings/ai',(req,res)=>{aiSettings.remove();res.json(aiSettings.status());});
app.post('/api/settings/ai/test',rateLimit({windowMs:60000,limit:5,legacyHeaders:false,message:{error:'För många anslutningstester. Vänta en minut.'}}),async(req,res)=>{
 const key=req.body?.apiKey!==undefined?validateApiKey(req.body.apiKey):aiSettings.getKey();
 if(!key)throw fail('Spara eller ange en OpenAI API-nyckel innan du testar anslutningen.');
 await providers.testConnection(key);
 res.json({ok:true,message:'Anslutningen fungerar. OpenAI godkände nyckeln och besvarade ett kort texttest.'});
});
app.get('/api/students',(req,res)=>res.json(db.prepare("SELECT * FROM students WHERE org_id='pilot' ORDER BY name COLLATE NOCASE").all()));
app.post('/api/students',(req,res)=>{const s=studentSchema.parse(req.body),id=randomUUID();s.phone=phone(s.phone);db.prepare("INSERT INTO students VALUES(?,'pilot',?,?,?)").run(id,s.name,s.email,s.phone);res.status(201).json({id,...s});});
app.put('/api/students/:id',(req,res)=>{const s=studentSchema.parse(req.body);s.phone=phone(s.phone);const result=db.prepare("UPDATE students SET name=?,email=?,phone=? WHERE id=? AND org_id='pilot'").run(s.name,s.email,s.phone,req.params.id);if(!result.changes)throw fail('Eleven finns inte.',404);res.json({id:req.params.id,...s});});
app.delete('/api/students/:id',(req,res)=>{if(db.prepare("SELECT id FROM feedback WHERE student_id=? AND status='sending'").get(req.params.id))throw fail('Vänta tills det pågående utskicket är klart.',409);db.prepare("DELETE FROM students WHERE id=? AND org_id='pilot'").run(req.params.id);res.json({ok:true});});
app.get('/api/history',(req,res)=>res.json(db.prepare("SELECT f.*,s.name FROM feedback f JOIN students s ON s.id=f.student_id WHERE f.org_id='pilot' ORDER BY f.created_at DESC").all()));
const aiLimit=rateLimit({windowMs:60000,limit:10,legacyHeaders:false,message:{error:'Vänta en minut innan nästa AI-anrop.'}});
app.post('/api/generate',aiLimit,async(req,res)=>{const b=z.object({studentId:z.string().uuid(),notes:z.string().trim().min(1).max(10000),text:z.string().max(11000).optional(),variant:z.enum(['normal','kortare','uppmuntrande'])}).parse(req.body);const s=db.prepare("SELECT name FROM students WHERE id=? AND org_id='pilot'").get(b.studentId);if(!s)throw fail('Välj en sparad elev.');res.json(await generateForMode({...b,name:s.name},connections,demo));});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:1,fields:0}});
app.post('/api/transcribe',aiLimit,upload.single('audio'),async(req,res)=>{try{if(!req.file||req.file.size<100||!/^audio\/(webm|mp4|ogg|wav|mpeg)/.test(req.file.mimetype))throw fail('Inspelningen är tom eller har ett format som inte stöds.');res.json({text:await providers.transcribe(req.file,connections.transcriptionKey())});}finally{if(req.file)req.file.buffer=undefined;}});
app.post('/api/feedback',(req,res)=>{const b=feedbackSchema.parse(req.body);const s=db.prepare("SELECT * FROM students WHERE id=? AND org_id='pilot'").get(b.studentId);if(!s)throw fail('Eleven finns inte.',404);const id=randomUUID();db.prepare("INSERT INTO feedback(id,org_id,student_id,created_at,notes,text,channel,subject,recipient,demo_mode,generation_source) VALUES(?,'pilot',?,?,?,?,?,?,?,?,?)").run(id,b.studentId,new Date().toISOString(),b.notes,b.text,b.channel,b.subject,b.channel==='sms'?s.phone:s.email,demo?1:0,b.source);res.status(201).json({id});});
app.post('/api/feedback/:id/send',rateLimit({windowMs:3600000,limit:30,legacyHeaders:false,message:{error:'Timgränsen för utskick har nåtts.'}}),async(req,res)=>{
 if(req.body.confirm!==true)throw fail('Bekräfta meddelandet innan du skickar.');
 const row=db.prepare("SELECT * FROM feedback WHERE id=? AND org_id='pilot'").get(req.params.id);if(!row)throw fail('Meddelandet finns inte.',404);
 if(row.status!=='draft')return res.json(row);
 if(demo){
  db.prepare("UPDATE feedback SET status='simulated',demo_mode=1 WHERE id=? AND status='draft'").run(row.id);
  return res.json(db.prepare('SELECT * FROM feedback WHERE id=?').get(row.id));
 }
 if(row.demo_mode)throw fail('Detta utkast skapades i demoläge och kan inte skickas som ett riktigt meddelande.',409);
 const cfg=configured();if(!cfg.sending||!cfg[row.channel])throw fail('Utskick är inte aktiverat eller tjänsten är inte konfigurerad.',503);
 if(!row.recipient)throw fail('Eleven saknar kontaktuppgift för den valda kanalen.');
 if(row.channel==='sms')phone(row.recipient);else z.email().parse(row.recipient);
 const claim=db.prepare("UPDATE feedback SET status='sending' WHERE id=? AND status='draft'").run(row.id);if(!claim.changes)throw fail('Utskicket behandlas redan.',409);
 try{const providerId=await providers.send(row);db.prepare("UPDATE feedback SET status='accepted',provider_id=? WHERE id=?").run(providerId,row.id);}catch(error){db.prepare('UPDATE feedback SET status=?,error=? WHERE id=?').run(error.uncertain?'unknown':'failed',error.message,row.id);}
 res.json(db.prepare('SELECT * FROM feedback WHERE id=?').get(row.id));
});
app.use('/api',(req,res)=>res.status(404).json({error:'Sidan finns inte.'}));
app.use((err,req,res,next)=>{if(res.headersSent)return next(err);res.status(err.status||(err instanceof z.ZodError?400:err instanceof multer.MulterError?413:500)).json({error:err.type==='entity.parse.failed'?'Begäran kunde inte läsas. Kontrollera inmatningen och försök igen.':err instanceof z.ZodError?'Kontrollera fälten. Namn, kontaktuppgifter eller text har ett ogiltigt format.':err instanceof multer.MulterError?'Ljudfilen är för stor. Spela in ett kortare meddelande.':err.message||'Något gick fel. Försök igen.'});});
if(production){app.use(express.static(resolve('dist')));app.get('/{*path}',(req,res)=>res.sendFile(resolve('dist/index.html')));}else{const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
const server=app.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1');
server.on('listening',()=>console.log(`Körklar: ${origin}${demo?' (demo – inga riktiga utskick)':''}`));
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Porten används redan. Stoppa den gamla projektservern eller välj en annan PORT.':'Servern kunde inte starta.');process.exit(1);});
