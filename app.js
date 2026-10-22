import {LocalVault, normalizeUsername} from './vault.js';

const vault = new LocalVault();
const root = document.getElementById('app');
const e = text => String(text ?? '').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const uuid = () => crypto.randomUUID().toLowerCase();
const state = {view:'welcome', tab:'library', authCreate:false, search:'', selected:null,
  draftTitle:'',draftMarkdown:'',draftColor:'#ae63ef',dirty:false,reading:false,graph:null,
  source:null,target:null, notice:'',busy:false, awayAt:null};
let noticeTimer;

function toast(message) {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className='toast';node.role='status';node.textContent=message;
  document.body.append(node);
  clearTimeout(noticeTimer);
  noticeTimer=setTimeout(()=>node.remove(),3800);
}
function logo() {return '<img class="logo" alt="Eosphorus Labyrinth" src="./icon.png">';}
function auth() {
  state.view='auth';
  root.innerHTML=`<main class="splash">${logo()}<div><div class="eyebrow">Eosphorus · Encrypted / Offline</div>
  <h1 class="wordmark">LABYRINTH</h1><h2>${state.authCreate?'Your private vault starts here.':'Unlock your knowledge.'}</h2>
  <p>Personal research, connections and Markdown, protected on this iPhone.</p></div>
  <form id="account-form" class="glass stack" autocomplete="off">
   <div class="input-group"><label for="username">Account name</label><input class="field" id="username" name="username" autocapitalize="none" autocomplete="username" minlength="3" maxlength="32" required placeholder="Choose your private username"></div>
   <div class="input-group"><label for="password">Password (12 or more characters)</label><input class="field" id="password" name="password" type="password" minlength="12" maxlength="128" autocomplete="${state.authCreate?'new-password':'current-password'}" required placeholder="Your secret password"></div>
   <button class="btn primary full" type="submit">${state.authCreate?'Create encrypted vault':'Unlock offline vault'}</button>
   <button class="btn ghost full" type="button" data-act="switch-auth">${state.authCreate?'Already have an account? Sign in':'New here? Create a vault'}</button>
  </form><div class="actions"><label for="backup-file" class="btn tiny">↑ Restore encrypted web backup</label><input hidden type="file" id="backup-file" accept=".json,application/json"></div>
  <button class="btn ghost" data-act="welcome">← Back to welcome</button>
  <p class="warning">Accounts are stored only in this browser’s device storage. There is no online recovery or synchronization; save an encrypted backup in Settings.</p></main>`;
}
function welcome() {
  state.view='welcome';
  root.innerHTML=`<main class="splash">${logo()}<div class="eyebrow">Private knowledge, without limits</div>
    <h1 class="wordmark">LABYRINTH</h1><h2>Every idea deserves<br>its own universe.</h2>
    <p>Explore a beautiful Markdown workspace, connect notes in 3D and keep your research encrypted on-device.</p>
    <div class="glass stack" style="margin-top:25px"><button class="btn primary full" data-act="demo">✦ Explore sample vault</button>
      <button class="btn full" data-act="create">Create my encrypted vault</button>
      <button class="btn ghost full" data-act="login">I already have an account</button></div>
    <div class="install-tip"><div class="eyebrow">Add to your iPhone</div><p class="subtle">Open in Safari → Share → Add to Home Screen → Open as Web App → Add. For offline use, open the app once while connected.</p></div>
    <p class="subtle">No cloud notes, no ads, no trackers. Demo notes are temporary; only password-protected accounts persist.</p>
  </main>`;
}
function setEditor(note=null){
  state.selected=note?.id??null;
  state.draftTitle=note?.title??'';
  state.draftMarkdown=note?.markdown??'';
  state.draftColor=note?.color??'#a966f7';
  state.dirty=false;state.reading=false;state.tab='editor';render();
}
function listNotes(){return vault.notes.filter(n=>!n.trashed).sort((a,b)=>b.updated-a.updated);}
function noteBy(id){return vault.notes.find(n=>n.id===id&&!n.trashed);}
function preview(text){return String(text||'').replace(/<!-- EOSPHORUS-GRAPH-COLOR:[^>]*-->/g,'').replace(/[#*`\[\]]/g,'').trim().slice(0,140);}
function library(){
  const notes=listNotes().filter(n=>`${n.title} ${n.markdown}`.toLowerCase().includes(state.search.toLowerCase()));
  return `<div class="page-scroller"><div class="section-head"><div><div class="eyebrow">Your private universe</div><h1>My Library</h1></div>
  <button class="btn primary tiny" data-act="new">＋ New note</button></div>
  <input id="search" type="search" class="field search" placeholder="Search your notes…" value="${e(state.search)}" autocomplete="off" aria-label="Search notes">
  <div id="note-list" class="note-list">${noteCards(notes)}</div>
  <div class="install-tip subtle">Your notes stay in your own encrypted vault. Nothing is uploaded or shared with another account.</div></div>`;
}
function noteCards(notes){
  if(!notes.length) return '<div class="empty"><span class="orb">✧</span>No notes match this view.<br><br>Tap New note to begin.</div>';
  return notes.map(n=>`<button class="note-card" data-act="open" data-id="${n.id}">
    <span class="dot" style="background:${n.color};color:${n.color}"></span><span class="content"><strong>${e(n.title)}</strong>
    <p>${e(preview(n.markdown)||'Blank Markdown note')}</p><small>${new Date(n.updated).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · ENCRYPTED</small></span><span aria-hidden="true">›</span></button>`).join('');
}
function editor(){
  const shown=state.draftTitle.trim()||'Untitled note';
  return `<div class="editorbar"><div class="title-wrap"><div class="eyebrow">Private document</div><h1>${e(shown)}</h1><small>MARKDOWN  /  ${vault.demo?'TEMPORARY DEMO':e(vault.username)}</small></div>
    <button class="btn primary tiny" data-act="save">Save</button></div>
    <div class="modebar"><span>${state.reading?'READING MODE':'WRITE YOUR STORY'}</span>
      <button class="btn tiny" data-act="toggle-read">${state.reading?'✎ Edit':'◉ Read'}</button></div>
    ${state.reading?'':`<div class="toolbar" aria-label="Formatting tools">
      ${[['h1','H1'],['h2','H2'],['bold','Bold'],['italic','Italic'],['list','• List'],['task','☐ Task'],['link','[[ Link'],['code','Code']].map(([name,label])=>`<button class="btn tiny" data-act="fmt" data-fmt="${name}">${label}</button>`).join('')}</div>`}
    <input id="note-title" class="field edit-title" maxlength="150" value="${e(state.draftTitle)}" placeholder="Name your note" ${state.reading?'hidden':''}>
    <div class="doc-scroll" id="doc-scroll"><div class="doc">${state.reading?'<article id="reader" class="reader"></article>':`<textarea id="note-text" spellcheck="true" placeholder="Start writing…\n\nUse [[Another Note]] to create connections."></textarea>`}</div></div>
    <div class="editorfoot"><span>◇ ENCRYPTED · SWIPE TO SCROLL</span><span class="actions">
      <button class="btn tiny" data-act="jump-top" aria-label="Scroll to top">↑</button>
      <button class="btn tiny" data-act="jump-end" aria-label="Scroll to bottom">↓</button>
      ${state.selected?'<button class="btn tiny danger" data-act="trash-one">Trash</button>':''}</span></div>`;
}
function appendFormatted(parent,text){
  // Safe Markdown subset rendered via DOM nodes, never interpreted as HTML.
  const token=/\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]|\*\*([^*\n]+)\*\*|(?<!\*)\*([^*\n]+)\*(?!\*)|`([^`\n]+)`/g;
  let match,pos=0;
  while((match=token.exec(text))){
    parent.append(document.createTextNode(text.slice(pos,match.index)));
    if(match[1]){
      const link=document.createElement('a');link.href='#';link.textContent=match[1];
      const found=listNotes().find(n=>n.title.toLowerCase()===match[1].trim().toLowerCase());
      link.dataset.act=found?'open':'missing-link';
      if(found) link.dataset.id=found.id;
      parent.append(link);
    } else {
      const kind=match[2]?'strong':match[3]?'em':'code';
      const tag=document.createElement(kind);
      tag.textContent=match[2]||match[3]||match[4];
      parent.append(tag);
    }
    pos=match.index+match[0].length;
  }
  parent.append(document.createTextNode(text.slice(pos)));
}
function renderMarkdown(markdown){
  const out=document.getElementById('reader');if(!out)return;
  out.replaceChildren();
  let fenced=false;
  for(const raw of markdown.split('\n')){
    if(raw.trim().startsWith('```')) {fenced=!fenced;continue;}
    if(!raw.trim()){out.append(document.createElement('div')).style.height='9px';continue;}
    const heading=/^(#{1,3})\s+(.+)$/.exec(raw);
    const li=/^\s*[-*]\s+(?:\[([ x])\]\s+)?(.*)/.exec(raw);
    const node=document.createElement(fenced?'pre':heading?`h${heading[1].length}`:li?'li':'p');
    if(li){appendFormatted(node,(li[1]!==undefined?(li[1]==='x'?'☑ ':'☐ '):'')+li[2]);}
    else if(fenced){node.textContent=raw;}
    else {appendFormatted(node,heading?heading[2]:raw);}
    out.append(node);
  }
}
function graphPage(){
  const count=listNotes().length;
  return `<div class="page-scroller"><div class="section-head"><div><div class="eyebrow">Connect the dots</div><h1>Knowledge Graph</h1></div><span class="pill">${count} notes</span></div>
  <p class="subtle">Drag to rotate in 3D. Pinch to zoom. Tap any node to open its note.</p>
  <div class="canvas-holder"><canvas id="graph-canvas" aria-label="Interactive 3D graph of notes"></canvas></div>
  <div class="graph-controls"><button class="btn tiny" data-act="graph-in">＋ Zoom</button><button class="btn tiny" data-act="graph-reset">↺ Reset</button><button class="btn tiny" data-act="graph-out">− Zoom</button></div>
  <div class="glass stack"><div class="eyebrow">Custom note colors</div><p class="subtle">Choose a note and any color. Changes stay with that encrypted note.</p>
  <select class="field" id="color-note"><option value="">Select a note</option>${listNotes().map(n=>`<option value="${n.id}" ${state.target===n.id?'selected':''}>${e(n.title)}</option>`).join('')}</select>
  <div class="color-control"><input type="color" id="dot-color" value="${state.draftColor}"><span id="color-hex">${state.draftColor.toUpperCase()}</span><button class="btn tiny" data-act="save-color">Save color</button></div>
  <div class="divider"></div><div class="eyebrow">Connect two notes</div><select class="field" id="link-from"><option value="">From a note</option>${listNotes().map(n=>`<option value="${n.id}" ${state.source===n.id?'selected':''}>${e(n.title)}</option>`).join('')}</select>
  <select class="field" id="link-to"><option value="">To another note</option>${listNotes().map(n=>`<option value="${n.id}" ${state.target===n.id?'selected':''}>${e(n.title)}</option>`).join('')}</select>
  <button class="btn primary" data-act="connect">Add real [[Wikilink]]</button></div></div>`;
}
function settings(){
  return `<div class="page-scroller"><div class="eyebrow">Owner controls</div><h1>Privacy & Settings</h1>
    <div class="glass stack"><h3>${vault.demo?'Temporary demo session':'Encrypted personal vault'}</h3>
    <p class="subtle">Account: ${e(vault.username)}. ${vault.demo?'All demo changes disappear when you lock.':'Password-protected AES-256-GCM ciphertext is stored in this device’s browser storage. The server never receives note content.'}</p>
    <div class="actions"><button class="btn primary" data-act="backup" ${vault.demo?'disabled':''}>↓ Encrypted backup</button><label class="btn" for="backup-file">↑ Restore backup</label><input hidden type="file" id="backup-file" accept=".json,application/json"><button class="btn" data-act="lock">Lock now</button></div>
    <p class="warning">Important: Clearing Safari website data or deleting the web app may erase local notes. Back up anything valuable. An account on one device will not automatically appear on another.</p>
    </div><div class="glass stack" style="margin-top:16px"><div class="eyebrow">Safari install</div><h3>Add to Home Screen</h3>
    <p class="subtle">Safari → Share → Add to Home Screen → Open as Web App → Add. Open online once before using offline.</p>
    <p class="subtle">The native Android and iOS apps are separate builds. This preview does not import or modify Android vaults, books or media.</p></div></div>`;
}
function trash(){
  const notes=vault.notes.filter(n=>n.trashed);
  return `<div class="page-scroller"><div class="section-head"><div><div class="eyebrow">Recoverable, encrypted</div><h1>Trash</h1></div></div>
    ${notes.length?notes.map(n=>`<div class="glass row spaced" style="margin:10px 0"><strong>${e(n.title)}</strong><button class="btn tiny" data-act="restore" data-id="${n.id}">Restore</button></div>`).join(''):'<div class="empty">Nothing in Trash.</div>'}</div>`;
}
function render(){
  if(!vault.unlocked){welcome();return;}
  state.view='workspace';
  const pages={library,editor,graph:graphPage,trash,settings};
  root.innerHTML=`<div class="workspace"><header class="topbar">${logo()}<div class="brand"><strong>LABYRINTH</strong><small>EOSPHORUS · ${vault.demo?'DEMO':'ENCRYPTED / OFFLINE'}</small></div>
     <button class="btn tiny" data-act="lock">◇ Lock</button></header><main class="page">${pages[state.tab]()}</main>
   <nav class="bottomnav" aria-label="Primary navigation">${[['library','▦','Library'],['editor','✎','Editor'],['graph','◇','Graph'],['trash','♻','Trash'],['settings','⚙','Settings']].map(([key,icon,label])=>`<button class="tab ${state.tab===key?'active':''}" data-act="tab" data-tab="${key}" aria-label="${label}" aria-current="${state.tab===key?'page':'false'}"><b>${icon}</b><span>${label}</span></button>`).join('')}</nav></div>`;
  if(state.tab==='editor'){
    const area=document.getElementById('note-text');
    if(area){area.value=state.draftMarkdown;sizeTextArea(area);}
    if(state.reading) renderMarkdown(state.draftMarkdown);
  }
  if(state.tab==='graph') setupGraph();
}
function sizeTextArea(area){
  area.style.height='auto';
  area.style.height=Math.max(290,area.scrollHeight+12)+'px';
}
function clearSensitiveDraft(){
  state.selected=null;state.draftTitle='';state.draftMarkdown='';state.draftColor='#ae63ef';
  state.dirty=false;state.reading=false;state.search='';state.source=null;state.target=null;
}
async function saveDraft(){
  const title=state.draftTitle.trim();
  if(!title||title.length>150||/[\u0000-\u001f/\\]/.test(title)) throw new Error('Enter a valid note title (1–150 characters).');
  if(vault.notes.some(n=>!n.trashed&&n.id!==state.selected&&n.title.toLowerCase()===title.toLowerCase()))
    throw new Error('A note with that title already exists.');
  const now=Date.now();
  const id=state.selected || uuid();
  const existing=vault.notes.find(n=>n.id===id);
  const note={id,title,markdown:state.draftMarkdown,color:existing?.color||state.draftColor,updated:now,trashed:false};
  const copy=vault.notes.filter(n=>n.id!==id);copy.push(note);
  await vault.saveNotes(copy);
  state.selected=id;state.dirty=false;toast(vault.demo?'Demo note updated':'Encrypted note saved');
}
async function perform(action,el){
  if(state.busy)return;
  switch(action){
    case 'welcome':welcome();break;
    case 'login':state.authCreate=false;auth();break;
    case 'create':state.authCreate=true;auth();break;
    case 'switch-auth':state.authCreate=!state.authCreate;auth();break;
    case 'demo':vault.demoLogin();state.tab='library';state.search='';render();break;
    case 'lock':vault.lock();clearSensitiveDraft();welcome();break;
    case 'new':setEditor();break;
    case 'open':{const note=noteBy(el.dataset.id);if(note)setEditor(note);break;}
    case 'missing-link':toast('Create this linked note in Library first.');break;
    case 'tab':state.tab=el.dataset.tab;render();break;
    case 'toggle-read':{
      if(!state.reading&&state.dirty){await saveDraft();}
      state.reading=!state.reading;render();break;
    }
    case 'save':await saveDraft();render();break;
    case 'fmt':formatText(el.dataset.fmt);break;
    case 'jump-top':document.getElementById('doc-scroll')?.scrollTo({top:0,behavior:'smooth'});break;
    case 'jump-end':{const scroll=document.getElementById('doc-scroll');if(scroll)scroll.scrollTo({top:scroll.scrollHeight,behavior:'smooth'});break;}
    case 'trash-one':{
      if(!state.selected)return;
      if(!confirm('Move this note into recoverable encrypted Trash?'))break;
      await vault.saveNotes(vault.notes.map(n=>n.id===state.selected?{...n,trashed:true,updated:Date.now()}:n));
      state.selected=null;state.dirty=false;state.tab='library';render();toast('Moved to encrypted Trash');break;
    }
    case 'restore':{
      const note=vault.notes.find(n=>n.id===el.dataset.id);if(!note)return;
      if(vault.notes.some(n=>!n.trashed&&n.title.toLowerCase()===note.title.toLowerCase()))throw new Error('Rename the existing note before restoring this title.');
      await vault.saveNotes(vault.notes.map(n=>n.id===note.id?{...n,trashed:false,updated:Date.now()}:n));render();toast('Note restored');break;
    }
    case 'backup':{
      const blob=await vault.backup();const url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;link.download='Eosphorus-Labyrinth-encrypted-backup.json';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Encrypted backup downloaded');break;
    }
    case 'graph-in':state.graph.zoom=Math.min(2.6,state.graph.zoom*1.2);drawGraph();break;
    case 'graph-out':state.graph.zoom=Math.max(.48,state.graph.zoom/1.2);drawGraph();break;
    case 'graph-reset':state.graph.a=.33;state.graph.b=-.18;state.graph.zoom=1;drawGraph();break;
    case 'save-color':{
      const id=document.getElementById('color-note')?.value;const color=document.getElementById('dot-color')?.value;
      if(!noteBy(id))throw new Error('Choose a note to color first.');
      await vault.saveNotes(vault.notes.map(n=>n.id===id?{...n,color,updated:Date.now()}:n));render();toast('Graph color encrypted with note');break;
    }
    case 'connect':{
      const from=document.getElementById('link-from')?.value,to=document.getElementById('link-to')?.value;
      const src=noteBy(from),dst=noteBy(to);
      if(!src||!dst||src.id===dst.id)throw new Error('Choose two different notes.');
      if(!confirm(`Add a real link from “${src.title}” to “${dst.title}”?`))break;
      const link=`[[${dst.title}]]`;
      if(!src.markdown.includes(link)){
        await vault.saveNotes(vault.notes.map(n=>n.id===src.id?{...n,markdown:n.markdown+'\n'+link+'\n',updated:Date.now()}:n));
      }
      render();toast('Encrypted Wikilink saved');break;
    }
  }
}
function formatText(format){
  const area=document.getElementById('note-text');if(!area)return;
  const start=area.selectionStart,end=area.selectionEnd,selection=area.value.slice(start,end);
  const formats={h1:`# ${selection||'Heading'}`,h2:`## ${selection||'Subheading'}`,bold:`**${selection||'bold'}**`,italic:`*${selection||'italic'}*`,list:`- ${selection||'List item'}`,task:`- [ ] ${selection||'Task'}`,link:`[[${selection||'Note Name'}]]`,code:'`'+(selection||'code')+'`'};
  const added=formats[format];if(!added)return;
  area.setRangeText(added,start,end,'end');state.draftMarkdown=area.value;state.dirty=true;sizeTextArea(area);area.focus();
}

// Deterministic XYZ graph with camera perspective, touch rotation, pinch and node selection.
function graphPoints(){
  const notes=listNotes().slice(0,90),n=Math.max(notes.length,1);
  const map=new Map(notes.map((note,i)=>{
    const y=1-(i+.5)*2/n,angle=i*2.399963229728653;
    const radius=Math.sqrt(Math.max(0,1-y*y));
    return [note.title.toLowerCase(),{note,x:Math.cos(angle)*radius,y,z:Math.sin(angle)*radius}];
  }));
  const edges=[];
  for(const point of map.values()){
    for(const [,name] of point.note.markdown.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g)){
      const target=map.get(name.trim().toLowerCase());if(target&&point!==target)edges.push([point,target]);
    }
  }
  return {points:Array.from(map.values()),edges};
}
function setupGraph(){
  const canvas=document.getElementById('graph-canvas');if(!canvas)return;
  const model={canvas,...graphPoints(),a:.33,b:-.18,zoom:1,pointers:new Map(),pressed:null,hadMulti:false,
    screenNodes:[]};state.graph=model;
  canvas.addEventListener('pointerdown',event=>{
    event.preventDefault();canvas.setPointerCapture(event.pointerId);
    const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    model.pointers.set(event.pointerId,{x,y});model.pressed={x,y};
    if(model.pointers.size>1)model.hadMulti=true;
  });
  canvas.addEventListener('pointermove',event=>{
    const old=model.pointers.get(event.pointerId);if(!old)return;
    event.preventDefault();const rect=canvas.getBoundingClientRect();
    const point={x:event.clientX-rect.left,y:event.clientY-rect.top};
    if(model.pointers.size===1){model.a+=(point.x-old.x)*.009;model.b=Math.max(-1.2,Math.min(1.2,model.b+(point.y-old.y)*.009));}
    else if(model.pointers.size===2){
      const others=Array.from(model.pointers.entries()).filter(([id])=>id!==event.pointerId);
      if(others.length){const other=others[0][1];
        const was=Math.hypot(old.x-other.x,old.y-other.y)||1,now=Math.hypot(point.x-other.x,point.y-other.y);
        model.zoom=Math.max(.48,Math.min(2.6,model.zoom*(now/was)));}
    }
    model.pointers.set(event.pointerId,point);drawGraph();
  });
  canvas.addEventListener('pointerup',event=>{
    const rect=canvas.getBoundingClientRect();const x=event.clientX-rect.left,y=event.clientY-rect.top;
    if(!model.hadMulti&&model.pressed&&Math.hypot(x-model.pressed.x,y-model.pressed.y)<11){
      const found=model.screenNodes.filter(p=>Math.hypot(x-p.x,y-p.y)<Math.max(p.r+9,18)).sort((a,b)=>b.depth-a.depth)[0];
      if(found)setEditor(found.note);
    }
    model.pointers.delete(event.pointerId);if(!model.pointers.size){model.pressed=null;model.hadMulti=false;}
  });
  canvas.addEventListener('pointercancel',event=>{model.pointers.delete(event.pointerId);model.pressed=null;model.hadMulti=false;});
  const resize=new ResizeObserver(()=>{if(state.graph===model)drawGraph();});resize.observe(canvas);
  model.resize=resize;drawGraph();
}
function drawGraph(){
  const m=state.graph;if(!m||!document.body.contains(m.canvas))return;
  const canvas=m.canvas,rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height;
  if(w<=0||h<=0)return;
  const pixelRatio=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.floor(w*pixelRatio);canvas.height=Math.floor(h*pixelRatio);
  const context=canvas.getContext('2d');context.setTransform(pixelRatio,0,0,pixelRatio,0,0);
  const transform=p=>{
    const cos=Math.cos(m.a),sin=Math.sin(m.a),cb=Math.cos(m.b),sb=Math.sin(m.b);
    const x=p.x*cos-p.z*sin,z=p.x*sin+p.z*cos,y=p.y*cb-z*sb,depth=p.y*sb+z*cb;
    const scale=Math.min(w,h)*.37*m.zoom*3/(3.7-depth);
    return {...p,x:w/2+x*scale,y:h/2-y*scale,depth,r:Math.max(5,Math.min(14,7*3/(3.7-depth)*m.zoom))};
  };
  const coords=new Map(m.points.map(p=>[p,transform(p)]));
  for(const [p,q] of m.edges){const a=coords.get(p),b=coords.get(q);context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.strokeStyle='#a676db65';context.lineWidth=1.4;context.stroke();}
  m.screenNodes=Array.from(coords.values()).sort((a,b)=>a.depth-b.depth);
  for(const p of m.screenNodes){context.beginPath();context.arc(p.x,p.y,p.r*2.3,0,2*Math.PI);context.fillStyle=p.note.color+'18';context.fill();
    context.beginPath();context.arc(p.x,p.y,p.r,0,2*Math.PI);context.fillStyle=p.note.color;context.shadowColor=p.note.color;context.shadowBlur=14;context.fill();context.shadowBlur=0;}
  if(!m.points.length){context.fillStyle='#c4a7d8';context.textAlign='center';context.font='14px -apple-system, sans-serif';context.fillText('Create notes to grow your graph',w/2,h/2);}
}

root.addEventListener('submit',async event=>{
  if(event.target.id!=='account-form')return;
  event.preventDefault();if(state.busy)return;state.busy=true;
  const form=event.target,username=form.elements.username.value,password=form.elements.password.value;
  try{
    if(state.authCreate)await vault.register(username,password);else await vault.login(username,password);
    form.elements.password.value='';state.tab='library';clearSensitiveDraft();render();
    toast(state.authCreate?'Private vault created on this device':'Vault unlocked');
  }catch(error){form.elements.password.value='';toast(error.message||'Unable to unlock account.');}
  finally{state.busy=false;}
});
root.addEventListener('click',async event=>{
  const element=event.target.closest('[data-act]');if(!element)return;
  event.preventDefault();
  try{await perform(element.dataset.act,element);}catch(error){toast(error.message||'Action failed.');}
});
root.addEventListener('input',event=>{
  const target=event.target;
  if(target.id==='search'){
    state.search=target.value;
    document.getElementById('note-list').innerHTML=noteCards(listNotes().filter(n=>`${n.title} ${n.markdown}`.toLowerCase().includes(state.search.toLowerCase())));
  }
  if(target.id==='note-title'){state.draftTitle=target.value;state.dirty=true;}
  if(target.id==='note-text'){state.draftMarkdown=target.value;state.dirty=true;sizeTextArea(target);}
  if(target.id==='dot-color'){document.getElementById('color-hex').textContent=target.value.toUpperCase();}
});
root.addEventListener('change',async event=>{
  const target=event.target;
  if(target.id==='backup-file'){
    const file=target.files?.[0];if(!file)return;
    try{await vault.restoreBackup(file);toast('Encrypted account backup restored locally. Sign in using its original username and password.');}
    catch(error){toast(error.message||'Backup import failed.');}
    finally{target.value='';}
  }
  if(target.id==='color-note'){
    const note=noteBy(target.value);if(note){document.getElementById('dot-color').value=note.color;document.getElementById('color-hex').textContent=note.color.toUpperCase();}
  }
});
// Never display a decrypted vault while the web app is backgrounded.
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(vault.unlocked){state.awayAt=Date.now();root.classList.add('hidden');}}
  else if(state.awayAt!==null){
    if(Date.now()-state.awayAt>=300000){vault.lock();clearSensitiveDraft();welcome();toast('Session expired. Unlock your private vault.');}
    else if(vault.unlocked){render();}
    state.awayAt=null;root.classList.remove('hidden');
  }
});
if(!globalThis.isSecureContext||!globalThis.crypto?.subtle){
  root.innerHTML='<main class="splash"><h1>Secure connection required</h1><p>Open Eosphorus Labyrinth through HTTPS in Safari. Private vaults are disabled on insecure origins.</p></main>';
}else{
  welcome();
  if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});}
}
