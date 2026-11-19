import {captionStyles} from './caption-styles.js';
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
function App(){
 const [items,list]=useState([]),[p,set]=useState(null),[url,link]=useState(''),[busy,working]=useState(false),[msg,status]=useState('');
 const [automatic,autoMode]=useState(true),[time,clock]=useState(0),[clip,clipUrl]=useState('');
 useEffect(()=>()=>{if(clip)URL.revokeObjectURL(clip);},[clip]);
 const video=useRef(),upload=useRef(),preview=useRef(false);
 async function request(route,options){const r=await fetch(route,options);if(!r.ok)throw Error(await r.text());return r;}
 async function refresh(){list(await (await request('/api/projects')).json());}
 useEffect(()=>{refresh().catch(e=>status(e.message));},[]);
 async function run(fn){working(true);status('');try{await fn();}catch(e){status(e.message);}finally{working(false);}}
 function json(data){return {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)};}
 async function load(file){await run(async()=>{
  let r;if(file){const form=new FormData();form.append('video',file);r=await request('/api/upload',{method:'POST',body:form});}else r=await request('/api/youtube',json({url}));
  const source=await r.json();set(source);clipUrl('');await refresh();if(automatic)await generate(source);
 });}
 async function generate(source){
  status('Finding a highlight and transcribing speech…');
  const plan=await (await request('/api/projects/'+source._id+'/auto',json({font:source.font,frame:source.frame,layout:source.layout,captionStyle:source.captionStyle}))).json();
  set(plan);await refresh();status('Rendering vertical MP4…');
  const output=await request('/api/projects/'+plan._id+'/export',json(plan));
  clipUrl(URL.createObjectURL(await output.blob()));status(plan.reason);
 }
 function update(key,value){clipUrl('');set({...p,[key]:value});}
 async function action(name){await run(async()=>{
  const r=await request('/api/projects/'+p._id+'/'+name,json(p));
  if(name==='save'){await refresh();status('Project saved.');return;}
  const href=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=href;a.download='cutroom-short.mp4';a.click();setTimeout(()=>URL.revokeObjectURL(href),60000);status('MP4 exported.');
 });}
 return <><header><b>◩ &nbsp; Cutroom</b><span>Shorts studio</span></header><main><section><span className="eyebrow">VIDEO EDITOR</span><h1>Make the cut.</h1><p>Turn a moment from your video into a vertical short.</p>
 <fieldset disabled={busy}><h2>Source video</h2><label><input style={{width:"auto",display:"inline"}} type="checkbox" checked={automatic} onChange={e=>autoMode(e.target.checked)}/> Auto Short on import</label><label>YouTube link<input type="url" value={url} onChange={e=>link(e.target.value)} placeholder="Paste your video link"/></label><div className="row"><button disabled={!url} onClick={()=>load()}>Import link</button><button className="ghost" onClick={()=>upload.current.click()}>Upload video</button></div><input hidden ref={upload} type="file" accept="video/*" onChange={e=>{if(e.target.files[0])load(e.target.files[0]);e.target.value='';}}/>
 {items.length>0&&<label>Open a saved project<select value={p?._id||''} onChange={e=>{clipUrl('');set(items.find(x=>x._id===e.target.value));}}><option disabled value="">Select video</option>{items.map(x=><option key={x._id} value={x._id}>{x.title}</option>)}</select></label>}
 {p&&<><h2>Clip settings</h2><button className="ghost" onClick={()=>run(()=>generate(p))}>Generate Auto Short</button><div className="row">{['start','end'].map(k=><label key={k}>{k==='start'?'Start':'End'} (seconds)<input type="number" step="any" min="0" max={p.duration} value={p[k]} onChange={e=>update(k,Number(e.target.value))}/><button className="ghost" onClick={()=>update(k,video.current.currentTime)}>Mark here</button></label>)}</div><label>9:16 layout
 <select value={p.layout || 'fill'} onChange={event=>update('layout', event.target.value)}>
   <option value="fit">Fit entire video</option>
   <option value="fill">Fill frame (crop)</option>
 </select></label>
 {(p.layout || 'fill')==='fill' && <label>Horizontal framing<input type="range" value={p.frame} onChange={e=>update('frame',+e.target.value)}/></label>}<label>Caption<textarea maxLength="80" value={p.caption} onChange={e=>update('caption',e.target.value)} placeholder="Add text to your clip"/></label><label>Caption style<select value={p.captionStyle || 'Classic'} onChange={event=>update('captionStyle',event.target.value)}>
 {Object.entries(captionStyles).map(([key,style])=><option key={key} value={key}>{style.label}</option>)}
 </select></label><label>Typeface<select value={p.font} onChange={e=>update('font',e.target.value)}>{['Sans','Serif','Mono'].map(f=><option key={f}>{f}</option>)}</select></label><div className="row"><button onClick={()=>action('export')}>Export MP4</button><button className="ghost" onClick={()=>action('save')}>Save edits</button></div></>}
 </fieldset><p role="status">{busy?(msg||'Importing video…'):msg}</p>{clip&&<a className="download" href={clip} download="cutroom-auto.mp4">Download Auto Short MP4</a>}</section><aside><div className="bar"><b>Clip monitor</b><span>9 × 16</span></div><div className="monitor">{p?<><video key={p._id} ref={video} src={p.source} controls style={{objectFit:p.layout==='fit'?'contain':'cover',objectPosition:p.layout==='fit'?'center':p.frame+'% center'}} onTimeUpdate={()=>{clock(video.current.currentTime);if(preview.current&&video.current.currentTime>=p.end){video.current.pause();preview.current=false;}}}/><strong className={p.captionStyle || 'Classic'} style={{color:captionStyles[p.captionStyle || 'Classic'].color,fontFamily:{Sans:'sans-serif',Mono:'monospace',Serif:'serif'}[p.font]}}>{p.caption||p.cues?.find(c=>c.start<=time&&time<c.end)?.text}</strong></>:<div className="empty">▸<small>Import a video to preview</small></div>}</div>{p&&<button className="ghost" onClick={()=>{preview.current=true;video.current.currentTime=p.start;video.current.play().catch(e=>status(e.message));}}>Play selected clip</button>}</aside></main></>;
}
createRoot(document.getElementById('root')).render(<App/>);
