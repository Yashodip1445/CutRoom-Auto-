import {captionStyles} from './caption-styles.js';
import {analyze} from './auto-short.js';
import {subtitles} from './subtitles.js';
import express from 'express';
import multer from 'multer';
import {MongoClient} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
const exec=promisify(execFile), app=express(), media=path.resolve('media');
await mkdir(media,{recursive:true});
const db=new MongoClient(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017');
const projects=db.db('cutroom').collection('projects');
const upload=multer({dest:media,limits:{fileSize:512*1024*1024}});
const fonts={Sans:'DejaVuSans-Bold.ttf',Serif:'DejaVuSerif.ttf',Mono:'DejaVuSansMono.ttf'};
app.use(express.json());
app.use('/media',express.static(media));
app.use(express.static('dist'));
async function add(file,title){
  try {
    const {stdout}=await exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]);
    const info=JSON.parse(stdout), duration=Number(info.format.duration);
    if(!info.streams.some(s=>s.codec_type==='video') || !Number.isFinite(duration) || duration<=0) throw Error('Choose a playable video.');
    const project={_id:randomUUID(),title,source:'/media/'+path.basename(file),duration,start:0,end:Math.min(30,duration),caption:'',font:'Sans',frame:50,layout:'fit',captionStyle:'Arcade'};
    await projects.insertOne(project);
    return project;
  } catch(e){await rm(file,{force:true});throw e;}
}
app.get('/api/projects',async(req,res)=>res.json(await projects.find().sort({$natural:-1}).limit(100).toArray()));
app.post('/api/upload',upload.single('video'),async(req,res)=>{
  if(!req.file)return res.status(400).send('Choose a video file.');
  res.json(await add(req.file.path,req.file.originalname));
});
app.post('/api/youtube',async(req,res)=>{
  const url=new URL(req.body.url);
  const host=url.hostname.toLowerCase();
  const id=host==='youtu.be'?url.pathname.slice(1):['youtube.com','www.youtube.com','m.youtube.com'].includes(host)?url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|live)\/([^/]+)/)?.[1]:null;
  if(!/^[\w-]{11}$/.test(id||''))return res.status(400).send('Enter a YouTube video link.');
  const file=path.join(media,randomUUID()+'.mp4');
  try {
    await exec('yt-dlp',['--no-playlist','--no-part','--js-runtimes','node','--match-filter','!is_live & duration <= 7200','-f','bv[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4]','--max-filesize','512M','-o',file,'https://www.youtube.com/watch?v='+id],{timeout:300000});
    res.json(await add(file,'YouTube · '+id));
  }catch{await rm(file,{force:true});res.status(422).send('YouTube import unavailable for this video. Upload your original file.');}
});
function edits(body,p){
  const {start,end,caption,font,frame}=body;
  if(![start,end,frame].every(Number.isFinite)||start<0||end>p.duration||end<=start||end-start>180.000001||frame<0||frame>100||!Object.hasOwn(fonts,font)||typeof caption!=='string'||caption.length>80)throw Error('Choose a clip up to 180 seconds and a caption up to 80 characters.');
  const layout=body.layout ?? p.layout ?? 'fill';
  if(!['fit','fill'].includes(layout)) throw Error('Choose a supported layout.');
  const captionStyle=body.captionStyle ?? p.captionStyle ?? 'Classic';
  if(!Object.hasOwn(captionStyles,captionStyle)) throw Error('Choose a supported caption style.');
  return {start,end,caption,font,frame,layout,captionStyle};
}
app.post('/api/projects/:id/:action',async(req,res)=>{
  const p=await projects.findOne({_id:req.params.id});
  if(!p)return res.sendStatus(404);
  if(req.params.action==='auto'){
    try{
      const targetSeconds=req.body.targetSeconds ?? 30;
      if(![30,60,120,180].includes(targetSeconds)) return res.status(400).send('Choose a supported clip length.');
      const plan=await analyze(path.join(media,path.basename(p.source)),p.duration,targetSeconds);
      const appearance=edits({...p,...req.body},p);
      const fields={...appearance,...plan,caption:''};
      await projects.updateOne({_id:p._id},{$set:fields});
      return res.json({...p,...fields});
    }catch(err){console.error(err.message);return res.status(503).send('Speech analysis failed. Check model download access and retry, or use the manual editor.');}
  }
  const e=edits(req.body,p);
  if(req.params.action==='save'){await projects.updateOne({_id:p._id},{$set:e});return res.json({ok:true});}
  if(req.params.action!=='export')return res.sendStatus(404);
  const key=randomUUID(), caption=path.join(media,key+'.txt'), out=path.join(media,key+'.mp4');
  try{
    let filter=e.layout==='fit'
      ? 'scale=720:1280:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,setsar=1'
      : 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:(iw-ow)*'+(e.frame/100)+':(ih-oh)/2,setsar=1';
    const cues=e.caption?[{start:e.start,end:e.end,text:e.caption}]:(p.cues||[]);
    const srt=subtitles(cues,e.start,e.end);
    if(srt){
      await writeFile(caption+'.srt',srt);
      const family={Sans:'Arial',Serif:'Times New Roman',Mono:'Courier New'}[e.font];
      filter+=",subtitles="+path.basename(caption)+".srt:force_style='FontName="+family+",FontSize=16,MarginV=48,"+captionStyles[e.captionStyle].ass+"'";
    }
    await exec('ffmpeg',['-v','error','-ss',String(e.start),'-i',path.join(media,path.basename(p.source)),'-t',String(e.end-e.start),'-vf',filter,'-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',out],{cwd:media,timeout:600000});
    res.download(out,'cutroom-short.mp4',()=>rm(out,{force:true}).catch(()=>{}));
  } catch(err){await rm(out,{force:true});throw err;}finally{await Promise.all([rm(caption,{force:true}),rm(caption+'.srt',{force:true})]);}
});
app.use((err,req,res,next)=>{console.error(err.message);res.status(400).send(err.message.startsWith('Choose')?err.message:'Operation failed. Check the video format and database connection.');});
app.listen(3000,'0.0.0.0',()=>console.log('Cutroom is running at http://localhost:3000'));
