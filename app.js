import {LocalVault, normalizeUsername} from './vault.js?v=7';
import {KnowledgeIndex, sanitizedFeedback} from './knowledge_index.js?v=7';

const vault = new LocalVault();
const root = document.getElementById('app');
const e = text => String(text ?? '').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const uuid = () => crypto.randomUUID().toLowerCase();
const state = {view:'welcome', tab:'library', authCreate:false, search:'', selected:null,
  draftTitle:'',draftMarkdown:'',draftColor:'#ae63ef',dirty:false,reading:false,graph:null,
  source:null,target:null, notice:'',busy:false, awayAt:null,editorSeq:0,graphPage:0,
  collection:'All notes',showConnections:false,researchAllowed:false};
let autosaveTimer=null;
let pendingSave=Promise.resolve();
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
  clearTimeout(autosaveTimer);
  state.dirty=false;state.reading=false;state.showConnections=false;state.tab='editor';render();
}
function listNotes(){return vault.notes.filter(n=>!n.trashed).sort((a,b)=>b.updated-a.updated);}
function noteBy(id){return vault.notes.find(n=>n.id===id&&!n.trashed);}
function preview(text){return String(text||'').replace(/<!-- EOSPHORUS-GRAPH-COLOR:[^>]*-->/g,'').replace(/[#*`\[\]]/g,'').trim().slice(0,140);}
function library(){
  const index=new KnowledgeIndex(listNotes()),notes=index.search(state.search,state.collection);
  return `<div class="page-scroller"><div class="section-head"><div><div class="eyebrow">Your private universe</div><h1>My Library</h1></div>
  <button class="btn primary tiny" data-act="new">＋ New note</button></div>
  <input id="search" type="search" class="field search" placeholder="Search notes · tag:ai · title:research" value="${e(state.search)}" autocomplete="off" aria-label="Search notes">
  <select class="field" id="collection" aria-label="Smart Collections">${['All notes','Linked notes','Orphan notes','Books & Research',...index.tagNames().map(t=>'tag:'+t)].map(name=>'<option value="'+e(name)+'" '+(state.collection===name?'selected':'')+'>'+e(name)+'</option>').join('')}</select>
  <div class="eyebrow">${notes.length} of ${index.notes.length} notes · indexed locally</div>
  <div id="note-list" class="note-list">${noteCards(notes)}</div>
  <div class="install-tip subtle">Your notes stay in your own encrypted vault. Nothing is uploaded or shared with another account.</div></div>`;
}
function noteCards(notes){
  if(!notes.length) return '<div class="empty"><span class="orb">✧</span>No notes match this view.<br><br>Tap New note to begin.</div>';
  return notes.map(n=>`<button class="note-card" data-act="open" data-id="${n.id}">
    <span class="dot" style="background:${n.color};color:${n.color}"></span><span class="content"><strong>${e(n.title)}</strong>
    <p>${e(preview(n.markdown)||'Blank Markdown note')}</p><small>${new Date(n.updated).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · ENCRYPTED</small></span><span aria-hidden="true">›</span></button>`).join('');
}
function connectionPanel(){
  if(!state.showConnections||!state.selected)return '';
  const index=new KnowledgeIndex(listNotes());
  const buttons=items=>items.length?items.map(n=>'<button class="btn tiny" data-act="open" data-id="'+e(n.id)+'">'+e(n.title)+'</button>').join(''):'<small>No connections</small>';
  return '<section class="glass stack" aria-label="Note connections"><strong>Backlinks</strong>'+buttons(index.incoming(state.selected))+'<strong>Outgoing links</strong>'+buttons(index.outgoing(state.selected))+'</section>';
}
function editor(){
  const shown=state.draftTitle.trim()||'Untitled note';
  return `<div class="editorbar"><div class="title-wrap"><div class="eyebrow">Private document</div><h1>${e(shown)}</h1><small>MARKDOWN  /  ${vault.demo?'TEMPORARY DEMO':e(vault.username)}</small></div>
    <button class="btn tiny keyboard-done" type="button" data-act="keyboard-done" aria-label="Close keyboard">Done</button><button class="btn tiny" data-act="history">History</button><button class="btn tiny" data-act="connections">Connections</button><button class="btn primary tiny" data-act="save">Save</button></div>
    ${connectionPanel()}
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
  <p class="subtle">Drag from one dot to another to connect encrypted notes. Drag empty space to rotate, pinch to zoom, tap a dot to open.</p>
  <div class="canvas-holder"><canvas id="graph-canvas" aria-label="Interactive 3D graph of notes"></canvas></div>
  <div class="graph-controls"><button class="btn tiny" data-act="graph-in">＋ Zoom</button><button class="btn tiny" data-act="graph-reset">↺ Reset</button><button class="btn tiny" data-act="graph-out">− Zoom</button><button class="btn tiny" data-act="graph-prev">← Previous</button><button class="btn tiny" data-act="graph-next">Next →</button></div>
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
    <p class="subtle">The native Android and iOS apps are separate builds. This preview does not import or modify Android vaults, books or media.</p></div>
    <div class="glass stack" style="margin-top:16px"><div class="eyebrow">Permissioned local research</div>
    <button class="btn" data-act="research-permission">${state.researchAllowed?'Revoke research access':'Allow local source search until vault locks'}</button>
    <button class="btn" data-act="research-search" ${!state.researchAllowed?'disabled':''}>Find notes about a topic</button>
    <p class="subtle">Local note titles only. No model calls, training or uploads.</p></div>
    <div class="glass stack" style="margin-top:16px"><div class="eyebrow">Private tester tools</div>
    <button class="btn" data-act="beta-report">Export anonymous tester report</button>
    <p class="subtle">Manual local download. No note contents, passwords, account identifiers or screenshots.</p></div></div>`;
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
function scheduleEncryptedAutosave(){
  clearTimeout(autosaveTimer);
  autosaveTimer=setTimeout(async ()=>{
    if(!state.dirty||!vault.unlocked)return;
    try{await saveDraft(true);}
    catch(error){toast('Encrypted autosave failed: '+(error.message||'Check device storage'));}
  },1100);
}
function addRevision(oldNote,newNote){
  if(!oldNote)return newNote;
  if(oldNote.title===newNote.title&&oldNote.markdown===newNote.markdown&&oldNote.color===newNote.color)return oldNote;
  const versions=(oldNote.revisions||[]).slice(-11);
  versions.push({title:oldNote.title,markdown:oldNote.markdown,color:oldNote.color,updated:oldNote.updated});
  return {...newNote,revisions:versions};
}
async function saveDraft(quiet=false){
  clearTimeout(autosaveTimer);
  const snapshot={seq:state.editorSeq,id:state.selected,title:state.draftTitle.trim(),markdown:state.draftMarkdown,color:state.draftColor};
  if(!snapshot.title){
    if(!snapshot.markdown.trim()&&!snapshot.id){state.dirty=false;return;}
    snapshot.title='Untitled '+new Date().toLocaleString();
  }
  if(snapshot.title.length>150||/[\u0000-\u001f/\\]/.test(snapshot.title))
    throw new Error('Use a valid title (up to 150 characters).');
  const work=async()=>{
    let title=snapshot.title;
    const others=new Set(vault.notes.filter(n=>!n.trashed&&n.id!==snapshot.id).map(n=>n.title.toLowerCase()));
    if(others.has(title.toLowerCase())){
      let suffix=2;
      while(others.has((title.slice(0,140)+' ('+suffix+')').toLowerCase()))suffix++;
      title=title.slice(0,140)+' ('+suffix+')';
    }
    const id=snapshot.id||uuid(),existing=vault.notes.find(n=>n.id===id);
    const note=addRevision(existing,{...existing,id,title,markdown:snapshot.markdown,
      color:existing?.color||snapshot.color,updated:Date.now(),trashed:false});
    const next=vault.notes.filter(n=>n.id!==id);next.push(note);
    await vault.saveNotes(next);
    // Retain the same note ID even if typing continued during encryption.
    // Otherwise a second autosave could accidentally create a duplicate.
    if(state.selected===snapshot.id){
      state.selected=id;
      if(state.editorSeq===snapshot.seq){
        state.dirty=false;state.draftTitle=title;
      }else if(state.dirty){
        scheduleEncryptedAutosave();
      }
    }
    if(!quiet)toast(vault.demo?'Demo note saved':'Encrypted note saved');
  };
  const result=pendingSave.then(work);
  pendingSave=result.catch(()=>{});
  return result;
}
function graphLink(markdown,title){
  if(!title||/[\[\]|#\r\n/\\]/.test(title))throw new Error('Rename this note before linking it.');
  const normalize=s=>s.trim().replaceAll('\\','/').split('/').pop().replace(/\.md$/i,'').toLowerCase();
  const links=Array.from(markdown.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g),m=>normalize(m[1]));
  if(links.includes(title.toLowerCase()))return {markdown,changed:false};
  const pad=markdown.endsWith('\n\n')||!markdown?'':markdown.endsWith('\n')?'\n':'\n\n';
  return {markdown:markdown+pad+'[['+title+']]\n',changed:true};
}
async function connectGraphNodes(fromId,toId){
  if(!vault.unlocked)throw new Error('Unlock a private account first.');
  const a=vault.notes.find(n=>n.id===fromId&&!n.trashed);
  const b=vault.notes.find(n=>n.id===toId&&!n.trashed);
  if(!a||!b||a.id===b.id)throw new Error('Choose two different notes.');
  const link=graphLink(a.markdown,b.title);
  if(!link.changed)return false;
  const updated=addRevision(a,{...a,markdown:link.markdown,updated:Date.now()});
  await vault.saveNotes(vault.notes.map(n=>n.id===a.id?updated:n));
  return true;
}
async function perform(action,el){
  if(state.busy)return;
  switch(action){
    case 'welcome':welcome();break;
    case 'login':state.authCreate=false;auth();break;
    case 'create':state.authCreate=true;auth();break;
    case 'switch-auth':state.authCreate=!state.authCreate;auth();break;
    case 'demo':vault.demoLogin();state.tab='library';state.search='';render();break;
    case 'lock':if(state.dirty)await saveDraft(true);clearTimeout(autosaveTimer);state.researchAllowed=false;state.collection='All notes';vault.lock();clearSensitiveDraft();welcome();break;
    case 'new':if(state.dirty)await saveDraft(true);setEditor();break;
    case 'open':{if(state.dirty)await saveDraft(true);const note=noteBy(el.dataset.id);if(note)setEditor(note);break;}
    case 'missing-link':toast('Create this linked note in Library first.');break;
    case 'tab':if(state.dirty)await saveDraft(true);state.tab=el.dataset.tab;render();break;
    case 'toggle-read':{
      if(!state.reading&&state.dirty){await saveDraft();}
      state.reading=!state.reading;render();break;
    }
    case 'save':await saveDraft();render();break;
    case 'research-permission':state.researchAllowed=!state.researchAllowed;render();toast(state.researchAllowed?'Local note search authorized for this session':'Research access revoked');break;
    case 'research-search':{
      if(!state.researchAllowed||!vault.unlocked)throw new Error('Enable research access in Settings first.');
      const query=prompt('Search private note titles or keywords:');
      if(!query)break;
      const notes=new KnowledgeIndex(listNotes()).search(query).slice(0,10);
      if(!notes.length){toast('No matching local notes.');break;}
      alert('Matching titles in this vault:\n'+notes.map(n=>'• '+n.title).join('\n'));
      break;
    }
    case 'beta-report':{
      const bytes=JSON.stringify(sanitizedFeedback(),null,2),blob=new Blob([bytes],{type:'application/json'});
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='Eosphorus-Labyrinth-anonymous-beta.json';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Sanitized report downloaded locally');break;
    }
    case 'connections':if(state.dirty)await saveDraft(true);state.showConnections=!state.showConnections;render();break;
    case 'history':{
      if(state.dirty)await saveDraft(true);
      const current=noteBy(state.selected);const revisions=(current?.revisions||[]).slice().reverse();
      if(!revisions.length){toast('No older versions saved yet.');break;}
      const answer=prompt('Restore an encrypted revision? Enter 1–'+revisions.length+' (most recent first).\n'+revisions.map((r,i)=>(i+1)+'. '+new Date(r.updated).toLocaleString()+' — '+r.title).join('\n'));
      if(answer===null)break;
      const index=Number(answer)-1;
      if(!Number.isInteger(index)||index<0||index>=revisions.length)throw new Error('Select a valid revision number.');
      if(!confirm('Restore this version? The current note remains in encrypted history.'))break;
      const prior=revisions[index];
      const restored=addRevision(current,{...current,title:prior.title,markdown:prior.markdown,color:prior.color,updated:Date.now()});
      await vault.saveNotes(vault.notes.map(n=>n.id===current.id?restored:n));setEditor(restored);toast('Encrypted version restored');break;
    }
    case 'keyboard-done':document.activeElement?.blur();syncEditorKeyboardSpace();break;
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
    case 'graph-prev':state.graphPage=Math.max(0,state.graphPage-1);render();break;
    case 'graph-next':state.graphPage=Math.min(Math.max(0,Math.ceil(listNotes().length/60)-1),state.graphPage+1);render();break;
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
  area.setRangeText(added,start,end,'end');state.draftMarkdown=area.value;state.dirty=true;state.editorSeq++;scheduleEncryptedAutosave();sizeTextArea(area);area.focus();
}

// Deterministic XYZ graph with camera perspective, touch rotation, pinch and node selection.
function graphPoints(){
  const notes=listNotes().slice(state.graphPage*60,(state.graphPage+1)*60),n=Math.max(notes.length,1);
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
  const coords=event=>{
    const box=canvas.getBoundingClientRect();
    return {x:event.clientX-box.left,y:event.clientY-box.top};
  };
  const hit=(x,y,distance=27)=>model.screenNodes.filter(p=>
    Math.hypot(x-p.x,y-p.y)<Math.max(p.r+11,distance)).sort((a,b)=>b.depth-a.depth)[0];
  canvas.addEventListener('pointerdown',event=>{
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const point=coords(event);
    model.pointers.set(event.pointerId,point);
    model.pressed={...point,node:hit(point.x,point.y),moved:false,connecting:false};
    if(model.pointers.size>1){model.hadMulti=true;model.pressed.node=null;}
  });
  canvas.addEventListener('pointermove',event=>{
    const old=model.pointers.get(event.pointerId);if(!old)return;
    event.preventDefault();
    const point=coords(event);
    if(model.pointers.size===1){
      if(model.pressed?.node){
        if(Math.hypot(point.x-model.pressed.x,point.y-model.pressed.y)>12)
          model.pressed.connecting=true;
        if(model.pressed.connecting){
          model.linkCursor=point;
          model.linkHover=hit(point.x,point.y,37);
          if(model.linkHover?.note.id===model.pressed.node.note.id)model.linkHover=null;
        }
      }else{
        model.a+=(point.x-old.x)*.009;
        model.b=Math.max(-1.2,Math.min(1.2,model.b+(point.y-old.y)*.009));
        if(Math.hypot(point.x-model.pressed.x,point.y-model.pressed.y)>10)
          model.pressed.moved=true;
      }
    }else if(model.pointers.size===2){
      const others=Array.from(model.pointers.entries()).filter(([id])=>id!==event.pointerId);
      if(others.length){
        const other=others[0][1];
        const was=Math.hypot(old.x-other.x,old.y-other.y)||1;
        const now=Math.hypot(point.x-other.x,point.y-other.y);
        model.zoom=Math.max(.48,Math.min(2.6,model.zoom*(now/was)));
      }
    }
    model.pointers.set(event.pointerId,point);
    drawGraph();
  });
  canvas.addEventListener('pointerup',async event=>{
    const point=coords(event);
    const pressed=model.pressed;
    const validSingle=!model.hadMulti&&model.pointers.size===1;
    const source=pressed?.node?.note;
    const target=pressed?.connecting?hit(point.x,point.y,37)?.note:null;
    model.linkCursor=null;model.linkHover=null;
    model.pointers.delete(event.pointerId);
    if(!model.pointers.size){model.pressed=null;model.hadMulti=false;}
    drawGraph();
    if(validSingle&&pressed?.connecting&&source&&target&&source.id!==target.id){
      if(!confirm('Connect '+source.title+' → '+target.title+'? This adds an encrypted [[Wikilink]] to the source note.'))return;
      try{
        const changed=await connectGraphNodes(source.id,target.id);
        if(!changed){toast('These notes already have a link.');return;}
        if(state.graph===model){
          const fresh=graphPoints();model.points=fresh.points;model.edges=fresh.edges;drawGraph();
        }
        toast('Notes connected in your encrypted vault');
      }catch(error){toast(error.message||'Could not save the connection.');}
    }else if(validSingle&&pressed?.node&&!pressed.connecting&&!pressed.moved){
      setEditor(pressed.node.note);
    }
  });
  canvas.addEventListener('pointercancel',event=>{
    model.pointers.delete(event.pointerId);
    model.pressed=null;model.hadMulti=false;
    model.linkCursor=null;model.linkHover=null;
    drawGraph();
  });
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
  context.fillStyle='#0b0816';context.fillRect(0,0,w,h);
  context.save();context.translate(w/2,h/2);context.scale(1,.58);
  for(const k of [1,2,3]){context.beginPath();context.ellipse(0,0,Math.min(w,h)*.15*k,Math.min(w,h)*.15*k,0,0,Math.PI*2);context.strokeStyle='#aa61e528';context.lineWidth=1.5;context.stroke();}
  context.restore();
  const transform=p=>{
    const cos=Math.cos(m.a),sin=Math.sin(m.a),cb=Math.cos(m.b),sb=Math.sin(m.b);
    const x=p.x*cos-p.z*sin,z=p.x*sin+p.z*cos,y=p.y*cb-z*sb,depth=p.y*sb+z*cb;
    const scale=Math.min(w,h)*.37*m.zoom*3/(3.7-depth);
    return {...p,x:w/2+x*scale,y:h/2-y*scale,depth,r:Math.max(5,Math.min(14,7*3/(3.7-depth)*m.zoom))};
  };
  const coords=new Map(m.points.map(p=>[p,transform(p)]));
  for(const [p,q] of m.edges){const a=coords.get(p),b=coords.get(q);context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.strokeStyle='#a676db65';context.lineWidth=1.4;context.stroke();}
  m.screenNodes=Array.from(coords.values()).sort((a,b)=>a.depth-b.depth);
  for(const p of m.screenNodes){
    const color=/^#[0-9a-fA-F]{6}$/.test(p.note.color)?p.note.color:'#ae63ef';
    context.beginPath();context.arc(p.x,p.y,p.r*2.4,0,2*Math.PI);context.fillStyle=color+'17';context.fill();
    context.beginPath();context.arc(p.x,p.y,p.r*1.6,0,2*Math.PI);context.fillStyle=color+'35';context.fill();
    context.beginPath();context.arc(p.x,p.y,p.r,0,2*Math.PI);context.fillStyle=color;context.shadowColor=color;context.shadowBlur=12;context.fill();context.shadowBlur=0;
    context.beginPath();context.arc(p.x-p.r*.3,p.y-p.r*.33,Math.max(1.5,p.r*.23),0,2*Math.PI);context.fillStyle='#f7dcff';context.fill();
    if(m.points.length<=30||m.zoom>1.2){
      context.fillStyle='#e6d0f9';context.font='11px -apple-system, sans-serif';
      context.textAlign='center';context.fillText(p.note.title.slice(0,18),Math.max(28,Math.min(w-28,p.x)),p.y-p.r-10);
    }
  }
  if(m.linkCursor&&m.pressed?.node){
    const from=m.screenNodes.find(p=>p.note.id===m.pressed.node.note.id);
    if(from){
      context.beginPath();context.moveTo(from.x,from.y);context.lineTo(m.linkCursor.x,m.linkCursor.y);
      context.strokeStyle='#d8a7ff';context.lineWidth=2.7;context.stroke();
    }
    if(m.linkHover){
      context.beginPath();context.arc(m.linkHover.x,m.linkHover.y,Math.max(19,m.linkHover.r+8),0,Math.PI*2);
      context.strokeStyle='#a3ffbc';context.lineWidth=3;context.stroke();
    }
  }
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
    document.getElementById('note-list').innerHTML=noteCards(new KnowledgeIndex(listNotes()).search(state.search,state.collection));
  }
  if(target.id==='note-title'){state.draftTitle=target.value;state.dirty=true;state.editorSeq++;scheduleEncryptedAutosave();}
  if(target.id==='note-text'){state.draftMarkdown=target.value;state.dirty=true;state.editorSeq++;sizeTextArea(target);scheduleEncryptedAutosave();}
  if(target.id==='dot-color'){document.getElementById('color-hex').textContent=target.value.toUpperCase();}
});
root.addEventListener('change',async event=>{
  const target=event.target;
  if(target.id==='collection'){state.collection=target.value;render();}
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
// Keep the note editing surface visible when mobile keyboards reduce the visual viewport.
function syncEditorKeyboardSpace(){
  const active=document.activeElement;
  const editable=active && (active.id==='note-text'||active.id==='note-title');
  const workspace=root.querySelector('.workspace');
  if(!workspace)return;
  workspace.classList.toggle('keyboard-editing',Boolean(editable));
  workspace.classList.toggle('note-body-focused',Boolean(editable&&active.id==='note-text'));
  if(editable){
    const vv=window.visualViewport;
    const available=vv?vv.height:window.innerHeight;
    if(Number.isFinite(available)&&available>140){
      workspace.style.setProperty('--labyrinth-edit-height',Math.floor(available)+'px');
    }
  }else workspace.style.removeProperty('--labyrinth-edit-height');
}
root.addEventListener('focusin',event=>{
  if(event.target?.id==='note-title'||event.target?.id==='note-text'){
    syncEditorKeyboardSpace();
    setTimeout(syncEditorKeyboardSpace,80);
    setTimeout(syncEditorKeyboardSpace,350);
  }
});
root.addEventListener('focusout',event=>{
  if(event.target?.id==='note-title'||event.target?.id==='note-text'){
    setTimeout(syncEditorKeyboardSpace,120);
  }
});
if(window.visualViewport){
  window.visualViewport.addEventListener('resize',syncEditorKeyboardSpace,{passive:true});
}
window.addEventListener('resize',syncEditorKeyboardSpace,{passive:true});

// Never display a decrypted vault while the web app is backgrounded.
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(vault.unlocked){if(state.dirty)saveDraft(true).catch(()=>{});state.awayAt=Date.now();root.classList.add('hidden');}}
  else if(state.awayAt!==null){
    if(Date.now()-state.awayAt>=300000){state.researchAllowed=false;state.collection='All notes';vault.lock();clearSensitiveDraft();welcome();toast('Session expired. Unlock your private vault.');}
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
