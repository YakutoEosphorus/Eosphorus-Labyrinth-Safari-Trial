// Ephemeral per-session index. Never persisted, uploaded, or shared among vaults.
const WIKI = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const TAG = /(^|[^\w/])#([\w-]+(?:\/[\w-]+)*)/g;
const stem = raw => String(raw).trim().replaceAll('\\','/').split('/').pop().replace(/\.md$/i,'').toLowerCase();

export function tagsFor(markdown){
  const body=String(markdown||'').split('\n').filter(line=>!/^\s{0,3}#{1,6}\s/.test(line)).join('\n');
  return new Set(Array.from(body.matchAll(TAG),hit=>hit[2].toLowerCase()));
}

export class KnowledgeIndex{
  constructor(notes){
    this.notes=notes.filter(n=>!n.trashed);
    this.byName=new Map(this.notes.map(n=>[stem(n.title),n]));
    this.byId=new Map(this.notes.map(n=>[n.id,n]));
    this.tags=new Map(this.notes.map(n=>[n.id,tagsFor(n.markdown)]));
    this.out=new Map(this.notes.map(n=>[n.id,new Set()]));
    this.inbound=new Map(this.notes.map(n=>[n.id,new Set()]));
    for(const note of this.notes){
      for(const link of note.markdown.matchAll(WIKI)){
        const target=this.byName.get(stem(link[1]));
        if(target&&target.id!==note.id){
          this.out.get(note.id).add(target.id);
          this.inbound.get(target.id).add(note.id);
        }
      }
    }
  }
  tagNames(){return [...new Set([...this.tags.values()].flatMap(s=>[...s]))].sort();}
  collection(name){
    const q=name.toLowerCase();
    if(q==='orphan notes')return this.notes.filter(n=>!this.out.get(n.id).size&&!this.inbound.get(n.id).size);
    if(q==='linked notes')return this.notes.filter(n=>this.out.get(n.id).size||this.inbound.get(n.id).size);
    if(q==='books & research')return this.notes.filter(n=>/^(book|research):/i.test(n.title));
    if(q.startsWith('tag:'))return this.notes.filter(n=>this.tags.get(n.id).has(q.slice(4)));
    return this.notes.slice();
  }
  search(query='',collection='All notes'){
    let notes=this.collection(collection);
    for(const term of query.split(/\s+/).filter(Boolean).slice(0,20)){
      const [kind,...rest]=term.split(':'), val=rest.join(':').toLowerCase();
      if(val&&kind.toLowerCase()==='tag')notes=notes.filter(n=>this.tags.get(n.id).has(val));
      else if(val&&kind.toLowerCase()==='title')notes=notes.filter(n=>n.title.toLowerCase().includes(val));
      else notes=notes.filter(n=>(n.title+' '+n.markdown).toLowerCase().includes(term.toLowerCase()));
    }
    return notes;
  }
  incoming(id){return [...(this.inbound.get(id)||[])].map(n=>this.byId.get(n)).filter(Boolean);}
  outgoing(id){return [...(this.out.get(id)||[])].map(n=>this.byId.get(n)).filter(Boolean);}
}

const permitted = new Set(['safari-pwa','collections','graph-drag','encrypted-revisions','beta-report']);
export function sanitizedFeedback(){
  return {
    schema:'eosphorus-labyrinth-anonymous-beta-v1',platform:'safari-pwa',version:'7',
    features:[...permitted].sort(),collection:'explicit-user-action',
    includes_note_text:false,includes_account_details:false,uploads_to_server:false
  };
}
