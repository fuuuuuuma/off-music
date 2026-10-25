import fs from 'node:fs';
import {analyzePCM} from '../src/lib/analysis.ts';
import {createChart} from '../src/lib/chart.ts';
const sr=22050,truth=[],signal=new Float32Array(sr*16);
for(let i=0;i<28;i++){const time=.6+i*.5,kind=['pulse','snap','edge'][i%3],freq={pulse:100,snap:1000,edge:7500}[kind];truth.push({time,kind});for(let j=0;j<sr*.1;j++){const n=Math.floor(time*sr)+j;if(n<signal.length)signal[n]+=Math.sin(2*Math.PI*freq*j/sr)*Math.exp(-j/(sr*.014))*.8;}}
const a=analyzePCM(signal,sr);const errors=truth.map(t=>{const near=a.peaks.reduce((best,p)=>Math.abs(p.time-t.time)<Math.abs(best.time-t.time)?p:best,a.peaks[0]);return {expected:t.time,actual:near.time,errorMs:Math.round((near.time-t.time)*10000)/10,expectedKind:t.kind,actualKind:near.kind};});
const abs=errors.map(x=>Math.abs(x.errorMs)).sort((a,b)=>a-b);
const result={method:a.method,sampleRate:sr,bpm:a.bpm,events:truth.length,detected:a.peaks.length,medianAbsoluteErrorMs:abs[Math.floor(abs.length/2)],p95AbsoluteErrorMs:abs[Math.floor(abs.length*.95)],maxAbsoluteErrorMs:Math.max(...abs),correctKinds:errors.filter(x=>x.actualKind===x.expectedKind).length,errors};
fs.writeFileSync('evidence/timing-v2.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,errors:undefined}));
if(result.p95AbsoluteErrorMs>12||result.correctKinds<26)process.exitCode=1;
if(process.argv.includes('--refresh-builtin')&&fs.existsSync('/tmp/off-music-v2.pcm')){const b=fs.readFileSync('/tmp/off-music-v2.pcm'),actual=analyzePCM(new Float32Array(b.buffer,b.byteOffset,b.byteLength/4),sr);fs.writeFileSync('public/music/play-pay.json',JSON.stringify(actual));console.log({track:'Play & Pay',duration:actual.duration,bpm:actual.bpm,peaks:actual.peaks.length,notes:['easy','normal','hard','expert'].map(d=>createChart(actual,d).length)});}
