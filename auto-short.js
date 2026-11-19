import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);
let model;

export function selectHighlight(cues, duration) {
  let best = {start: 0, end: Math.min(30, duration), cues: [], reason: 'Opening clip selected.'};
  let bestScore = -Infinity;
  for (let i = 0; i < cues.length; i++) {
    const start = cues[i].start;
    let spoken = 0;
    let words = 0;
    for (let j = i; j < cues.length; j++) {
      const {end, text} = cues[j];
      const length = end - start;
      if (length > 45) break;
      spoken += end - cues[j].start;
      words += text.split(/\s+/u).length;
      let score = Math.min(spoken / length, 1) + Math.min(words / 70, 1) - Math.abs(length - 30) / 18;
      if (i === 0 || start - cues[i-1].end >= 0.45) score += 0.35;
      if (/[.!?।]$/u.test(text)) score += 0.35;
      if (score > bestScore) {
        bestScore = score;
        best = {start, end, cues: cues.slice(i, j+1), reason: 'Selected using speech density, pauses and sentence endings.'};
      }
    }
  }
  return best;
}

export async function analyze(file, duration) {
  const {stdout} = await exec('ffprobe', ['-v','error','-select_streams','a:0','-show_entries','stream=index','-of','csv=p=0',file]);
  const cues = [];
  if (!stdout.trim()) return selectHighlight(cues, duration);
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
  return selectHighlight(cues, duration);
}
