const microphoneMessage=error=>({NotAllowedError:'Mikrofonåtkomst nekades. Tillåt mikrofonen för localhost i Chrome eller skriv feedback istället.',NotFoundError:'Ingen mikrofon hittades. Anslut en mikrofon eller skriv feedback istället.',NotReadableError:'Mikrofonen kunde inte öppnas. Kontrollera Windows mikrofonbehörighet och att ingen annan app blockerar mikrofonen.',SecurityError:'Mikrofonen är blockerad. Öppna appen på localhost eller via HTTPS.'}[error?.name]||'Kunde inte starta mikrofonen. Kontrollera mikrofonen eller skriv feedback istället.');
const speechMessage=code=>({'not-allowed':'Taligenkänning nekades. Tillåt mikrofonen i Chrome eller skriv anteckningarna.','service-not-allowed':'Webbläsarens taligenkänning är inte tillgänglig. Skriv anteckningarna manuellt.','network':'Taligenkänningen kunde inte nå webbläsarens taltjänst. Kontrollera internetanslutningen eller skriv anteckningarna.','audio-capture':'Taligenkänningen kunde inte läsa mikrofonen. Skriv anteckningarna manuellt.','language-not-supported':'Webbläsarens taltjänst stöder inte svenska här. Skriv anteckningarna manuellt.','no-speech':'Inget tal uppfattades. Spela in igen eller skriv anteckningarna.'}[code]||'Taligenkänningen avbröts. Kontrollera texten eller skriv anteckningarna manuellt.');

// MediaRecorder captures real audio. SpeechRecognition listens LIVE, not to the finished blob.
// A missing or broken audio visualizer must never prevent microphone recording.
export function createVoiceCapture({onRecording=()=>{},onLevel=()=>{},onAutoStop=()=>{},env=globalThis,finalWaitMs=2500}={}){
 let stream,rec,ctx,analyser,frame,timer,speech,disposed=false,stopping=false,stopPromise;
 let chunks=[],completed=[],sessionResults=new Map(),speechError='',recordError='',speechEnded=true,resolveSpeech;
 let recordingEnded,resolveRecording,restarts=0,restartTimer;
 const cancelTimers=()=>{clearTimeout(timer);clearTimeout(restartTimer);if(frame!==undefined)env.cancelAnimationFrame?.(frame);};
 function cleanup(){cancelTimers();for(const track of stream?.getTracks()||[]){track.onended=null;track.stop();}ctx?.close().catch(()=>{});onLevel(0);}
 function commitSpeech(){for(const result of sessionResults.values())if(result.final&&result.text.trim())completed.push(result.text.trim());sessionResults.clear();}
 function startSpeech(){
  const Speech=env.SpeechRecognition||env.webkitSpeechRecognition;
  if(!Speech){speechError='Automatisk transkribering stöds inte i den här webbläsaren. Öppna appen i Chrome eller skriv feedback istället.';return;}
  speech=new Speech();speech.lang='sv-SE';speech.continuous=true;speech.interimResults=true;
  speech.onresult=event=>{for(let i=event.resultIndex;i<event.results.length;i++){const result=event.results[i];sessionResults.set(i,{text:result[0]?.transcript||'',final:result.isFinal});}};
  speech.onerror=event=>{if(event.error==='aborted'&&(stopping||disposed))return;speechError=speechMessage(event.error);};
  speech.onend=()=>{speechEnded=true;commitSpeech();resolveSpeech?.();if(!stopping&&!disposed&&!speechError&&rec?.state==='recording'){
   if(restarts++<3)restartTimer=setTimeout(()=>{if(!stopping&&!disposed){try{speechEnded=false;speech.start();}catch{speechEnded=true;speechError='Taligenkänningen avslutades. Kontrollera texten och spela in igen vid behov.';}}},150);
   else speechError='Taligenkänningen avslutades tidigt. Kontrollera texten och spela in igen vid behov.';
  }};
  try{speechEnded=false;speech.start();}catch{speechEnded=true;speechError='Taligenkänningen kunde inte starta. Skriv anteckningarna manuellt.';}
 }
 function visualize(){try{
  const Audio=env.AudioContext||env.webkitAudioContext;if(!Audio||!env.requestAnimationFrame)return;
  ctx=new Audio();ctx.resume?.().catch(()=>{});analyser=ctx.createAnalyser();analyser.fftSize=256;ctx.createMediaStreamSource(stream).connect(analyser);const bytes=new Uint8Array(analyser.frequencyBinCount);
  const draw=()=>{if(disposed||stopping)return;analyser.getByteFrequencyData(bytes);onLevel(bytes.reduce((a,b)=>a+b,0)/bytes.length/128);frame=env.requestAnimationFrame(draw);};draw();
 }catch{/* Recording and recognition work without AudioContext. */}}
 async function start(){
  if(!env.navigator?.mediaDevices?.getUserMedia||!env.MediaRecorder)throw new Error('Inspelning stöds inte här. Använd Chrome på localhost eller skriv feedback istället.');
  try{
   stream=await env.navigator.mediaDevices.getUserMedia({audio:true});
   if(disposed){cleanup();return;}
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(m=>env.MediaRecorder.isTypeSupported?.(m));
   rec=new env.MediaRecorder(stream,mime?{mimeType:mime}:undefined);
   recordingEnded=new Promise(resolve=>{resolveRecording=resolve;});
   rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
   rec.onerror=()=>{recordError='Ljudinspelningen avbröts. Kontrollera anteckningarna och spela in igen vid behov.';if(!stopping&&!disposed)onAutoStop();};
   rec.onstop=()=>{resolveRecording();if(!stopping&&!disposed)onAutoStop();};
   rec.start(250);try{startSpeech();}catch{speechEnded=true;speechError='Taligenkänningen kunde inte starta. Skriv anteckningarna manuellt.';}visualize();onRecording(true);
   for(const track of stream.getTracks())track.onended=()=>{if(!stopping&&!disposed){recordError='Mikrofonen kopplades från. Kontrollera anteckningarna.';onAutoStop();}};
   timer=setTimeout(()=>{if(!stopping&&!disposed)onAutoStop();},180000);
  }catch(error){cleanup();try{speech?.abort();}catch{}throw new Error(microphoneMessage(error));}
 }
 function stop(){
  if(stopPromise)return stopPromise;
  stopping=true;cancelTimers();onRecording(false);
  stopPromise=(async()=>{
   if(!rec)return {text:'',blob:new Blob([]),warning:'Inspelningen har inte startat.'};
   let finalTimer,recordingTimer;
   const finalSpeech=speech&&!speechEnded?new Promise(resolve=>{resolveSpeech=resolve;finalTimer=setTimeout(()=>{speechError||='Taligenkänningen hann inte avslutas. Kontrollera texten och fyll i det som saknas.';resolve();},finalWaitMs);try{speech.stop();}catch{resolve();}}):Promise.resolve();
   try{if(rec.state!=='inactive')rec.stop();}catch{recordError='Inspelningen kunde inte avslutas normalt. Kontrollera anteckningarna.';resolveRecording();}
   const boundedRecording=Promise.race([recordingEnded,new Promise(resolve=>{recordingTimer=setTimeout(()=>{recordError='Ljudinspelningen avslutades inte normalt. Kontrollera anteckningarna.';resolve();},finalWaitMs+500);})]);
   await Promise.all([boundedRecording,finalSpeech]);clearTimeout(finalTimer);clearTimeout(recordingTimer);commitSpeech();
   try{speech?.abort();}catch{}cleanup();
   const blob=new Blob(chunks,{type:rec.mimeType||'audio/webm'});chunks=[];
   return {blob,text:completed.join(' ').trim(),warning:recordError||speechError};
  })();return stopPromise;
 }
 function dispose(){disposed=true;stopping=true;try{speech?.abort();}catch{}resolveSpeech?.();if(rec?.state==='recording')rec.stop();cleanup();chunks=[];}
 return {start,stop,dispose};
}
