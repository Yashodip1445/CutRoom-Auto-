import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);
let model;

export function selectHighlight(cues, duration, targetSeconds = 30) {
  const length = Math.min(targetSeconds, duration);
  let best = {start:0, end:length, cues:[], reason:'Opening clip selected.'};
  let bestScore = -Infinity;
  const sentenceEnd = /[.!?।]["”’']?$/u;
  const starts = new Set([0]);
  for (const cue of cues) {
    starts.add(Math.max(0, Math.min(duration-length, cue.start)));
    starts.add(Math.max(0, Math.min(duration-length, cue.end-length)));
  }
  let firstIndex = 0;
  for (const start of [...starts].sort((a,b)=>a-b)) {
    const end = Math.min(duration, start+length);
    while(firstIndex<cues.length && cues[firstIndex].end<=start) firstIndex++;
    let spoken=0;
    let lastIndex=firstIndex;
    const words=new Set();
    while(lastIndex<cues.length && cues[lastIndex].start<end) {
      const cue=cues[lastIndex++];
      spoken+=Math.min(end,cue.end)-Math.max(start,cue.start);
      for(const word of cue.text.toLowerCase().split(/\s+/u)) words.add(word);
    }
    if(lastIndex===firstIndex) continue;
    const first=cues[firstIndex], last=cues[lastIndex-1], prev=cues[firstIndex-1];
    const cleanStart=first.start>=start && (!prev || first.start-prev.end>=0.45 || sentenceEnd.test(prev.text));
    const cleanEnd=last.end<=end && sentenceEnd.test(last.text);
    const score=spoken/length + Math.min(words.size/length,1)*0.5 + Number(cleanStart)*0.45 + Number(cleanEnd)*0.45;
    if(score>bestScore) {
      bestScore=score;
      best={start,end,cues:cues.slice(firstIndex,lastIndex),reason:'Selected using speech coverage, vocabulary and sentence boundaries.'};
    }
  }
  return best;
}

export async function analyze(file, duration, targetSeconds = 30) {
  const {stdout} = await exec('ffprobe', ['-v','error','-select_streams','a:0','-show_entries','stream=index','-of','csv=p=0',file]);
  const cues = [];
  if (!stdout.trim()) return selectHighlight(cues, duration, targetSeconds);
  for (let offset = 0; offset < duration; offset += 60) {
    const {stdout: pcm} = await exec('ffmpeg', ['-v','error','-ss',String(offset),'-i',file,'-t','60','-vn','-ac','1','-ar','16000','-f','f32le','pipe:1'], {encoding:'buffer',maxBuffer:5*1024*1024});
    if (!pcm.length) break;
    const audio = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset+pcm.length));
    if (!audio.some(sample => Math.abs(sample) > 0.002)) continue;
    if (!model) {
      const {pipeline} = await import('@huggingface/transformers');
      model = pipeline('automatic-speech-recognition','onnx-community/whisper-base',{device:'cpu',dtype:'fp32'}).catch(err => {model = undefined; throw err;});
    }
    const transcribe = await model;
    const result = await transcribe(audio,{return_timestamps:true,chunk_length_s:30,stride_length_s:5,task:'transcribe'});
    for (const {timestamp, text} of result.chunks) {
      const start = offset + (timestamp[0] ?? 0);
      const end = Math.min(duration, offset + (timestamp[1] ?? audio.length / 16000));
      if (text.trim() && end > start) cues.push({start,end,text:text.trim()});
    }
  }
  return selectHighlight(cues, duration, targetSeconds);
}
