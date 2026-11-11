import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceCapture} from '../src/voice-capture.js';

function browser({speech=true,deny=false,visualizerFails=false,lateText='Kontrollera döda vinkeln.'}={}){
 const calls=[];const track={stop(){calls.push('track-stop');}};
 class Recorder{
  static isTypeSupported(mime){return mime.startsWith('audio/webm');}
  constructor(){this.state='inactive';this.mimeType='audio/webm';}
  start(){calls.push('record-start');this.state='recording';}
  stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['real-recording-test-bytes'])});this.onstop?.();});}
 }
 class Speech{
  constructor(){this.results=[];browser.lastSpeech=this;}
  start(){calls.push('speech-start');assert.equal(this.lang,'sv-SE');}
  stop(){calls.push('speech-stop');queueMicrotask(()=>{if(lateText){const result=[{transcript:lateText}];result.isFinal=true;this.onresult?.({resultIndex:0,results:[result]});}this.onend?.();});}
  abort(){calls.push('speech-abort');}
 }
 const env={navigator:{mediaDevices:{getUserMedia:async()=>{calls.push('permission');if(deny)throw {name:'NotAllowedError'};return {getTracks:()=>[track]};}}},MediaRecorder:Recorder};
 if(speech)env.webkitSpeechRecognition=Speech;
 if(visualizerFails){env.AudioContext=class{constructor(){throw new Error('audio context blocked');}};env.requestAnimationFrame=()=>{};}
 return {env,calls};
}
test('Mikrofon startar före liveigenkänning; stopp väntar på sista talresultatet och frigör resurser',async()=>{
 const {env,calls}=browser();const states=[];const session=createVoiceCapture({env,onRecording:s=>states.push(s)});
 await session.start();assert.deepEqual(calls.slice(0,3),['permission','record-start','speech-start']);
 const result=await session.stop();assert.equal(result.text,'Kontrollera döda vinkeln.');assert.ok(result.blob.size>0);assert.equal(result.warning,'');assert.deepEqual(states,[true,false]);assert.ok(calls.includes('track-stop'));assert.equal(await session.stop(),result);
});
test('Fel i ljudvisualisering blockerar inte en riktig MediaRecorder-session',async()=>{
 const {env,calls}=browser({visualizerFails:true});const session=createVoiceCapture({env});await session.start();const result=await session.stop();assert.ok(calls.includes('record-start'));assert.ok(result.text);
});
test('Saknad taligenkänning ger ingen påhittad text och behåller det inspelade ljudet',async()=>{
 const {env}=browser({speech:false});const session=createVoiceCapture({env});await session.start();const result=await session.stop();assert.equal(result.text,'');assert.match(result.warning,/skriv feedback istället/);assert.ok(result.blob.size>0);
});
test('Nekad mikrofonbehörighet visas på svenska; ingen inspelning startar',async()=>{
 const {env,calls}=browser({deny:true});await assert.rejects(()=>createVoiceCapture({env}).start(),/Mikrofonåtkomst nekades/);assert.ok(!calls.includes('record-start'));
});
test('Talresultat ersätts per index utan dubletter; nätverksfel behåller redan igenkänt tal',async()=>{
 const {env}=browser({lateText:''});const session=createVoiceCapture({env});await session.start();const speech=browser.lastSpeech;
 const result=[{transcript:'Öva filbyte.'}];result.isFinal=true;speech.onresult({resultIndex:0,results:[result]});speech.onresult({resultIndex:0,results:[result]});speech.onerror({error:'network'});
 const finished=await session.stop();assert.equal(finished.text,'Öva filbyte.');assert.match(finished.warning,/internetanslutningen/);
});
test('Stängning och ominspelning släpper mikrofonen utan att återanvända gammal transkription',async()=>{
 const first=browser();const session=createVoiceCapture({env:first.env});await session.start();session.dispose();assert.ok(first.calls.includes('track-stop'));
 const second=browser({lateText:'Nytt tal.'});const next=createVoiceCapture({env:second.env});await next.start();assert.equal((await next.stop()).text,'Nytt tal.');
});
