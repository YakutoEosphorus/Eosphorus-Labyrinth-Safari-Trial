/* Eosphorus Labyrinth PWA: local-only encrypted note storage, no network calls. */
const decoder = new TextDecoder('utf-8', {fatal:true});
const encoder = new TextEncoder();
const DB_NAME = 'eosphorus-labyrinth-web-v1';
const VERSION = 1;
export const LIMIT_NOTE_BYTES = 2 * 1024 * 1024;
export const LIMIT_VAULT_BYTES = 32 * 1024 * 1024;
export const LIMIT_NOTES = 1000;
const PROOF = 'EOSPHORUS-WEB-ACCOUNT-v1';

export function normalizeUsername(input) {
  const username = String(input || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(username)) throw new Error('Account name: 3–32 letters, numbers or underscores.');
  return username;
}
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Choose a password of 12–128 characters.');
  }
}
export function bytesToBase64(bytes) {
  let out = '';
  for(let i=0; i<bytes.length; i+=0x8000) out += String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(out);
}
export function base64ToBytes(text) {
  return Uint8Array.from(atob(text), x => x.charCodeAt(0));
}
export async function nameDigest(name) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(normalizeUsername(name))));
  return Array.from(bytes, x => x.toString(16).padStart(2,'0')).join('');
}
export async function deriveKey(password, salt) {
  validatePassword(password);
  if (!(salt instanceof Uint8Array) || salt.length !== 24) throw new Error('Invalid vault salt.');
  const seed = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},seed,
    {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptBytes(bytes, key, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,
    additionalData:encoder.encode(context),tagLength:128},key,bytes));
  const blob = new Uint8Array(5+iv.length+encrypted.length);
  blob.set(encoder.encode('EOSK2'));
  blob.set(iv,5);
  blob.set(encrypted,17);
  return blob;
}
export async function decryptBytes(blob, key, context) {
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  if (bytes.length < 33 || decoder.decode(bytes.subarray(0,5)) !== 'EOSK2') throw new Error('Invalid encrypted data.');
  try {
    return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(5,17),
      additionalData:encoder.encode(context),tagLength:128},key,bytes.subarray(17)));
  } catch { throw new Error('Vault authentication failed.'); }
}
export async function sealJSON(payload,key,context) {
  const bytes = encoder.encode(JSON.stringify(payload));
  if(bytes.byteLength>LIMIT_VAULT_BYTES) throw new Error('Vault has reached its safe size limit.');
  return encryptBytes(bytes,key,context);
}
export async function openJSON(data,key,context) {
  const plain = await decryptBytes(data,key,context);
  if(plain.byteLength>LIMIT_VAULT_BYTES) throw new Error('Vault is too large.');
  return JSON.parse(decoder.decode(plain));
}
function db() {
  return new Promise((resolve,reject)=>{
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains('accounts')) request.result.createObjectStore('accounts',{keyPath:'hash'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('Private browser storage unavailable.'));
    request.onblocked=()=>reject(new Error('Close other open Labyrinth tabs, then try again.'));
  });
}
async function readRecord(hash) {
  const connection=await db();
  try { return await new Promise((resolve,reject)=>{
    const tx=connection.transaction('accounts','readonly');
    const get=tx.objectStore('accounts').get(hash);
    get.onsuccess=()=>resolve(get.result);
    get.onerror=()=>reject(new Error('Cannot read private vault.'));
  }); } finally { connection.close(); }
}
async function writeRecord(record, newOnly=false) {
  const connection=await db();
  try { await new Promise((resolve,reject)=>{
    const tx=connection.transaction('accounts','readwrite');
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error || new Error('Encrypted write could not be completed.'));
    tx.onerror=()=>{};
    const store=tx.objectStore('accounts');
    if(newOnly) store.add(record); else store.put(record);
  }); } finally { connection.close(); }
}
const validId=id=>typeof id==='string' && /^[0-9a-f-]{36}$/.test(id);
const titleOk=title=>typeof title==='string' && title.trim().length>0 && title.trim().length<=150 && !/[\u0000-\u001f/\\]/.test(title);
export function checkNotes(notes) {
  if(!Array.isArray(notes) || notes.length>LIMIT_NOTES) throw new Error('Too many notes.');
  const ids=new Set();
  for(const note of notes) {
    if(!note || !validId(note.id) || !titleOk(note.title) || typeof note.markdown !== 'string' ||
       encoder.encode(note.markdown).length > LIMIT_NOTE_BYTES || typeof note.color !== 'string' ||
       !/^#[0-9a-fA-F]{6}$/.test(note.color) || typeof note.trashed !== 'boolean' || ids.has(note.id)) {
      throw new Error('Invalid note data or size.');
    }
    ids.add(note.id);
  }
}
export class LocalVault {
  constructor() { this.key=null; this.record=null; this.notes=[]; this.username=''; this.demo=false; }
  get unlocked(){ return !!this.key || this.demo; }
  async register(username,password) {
    if (!globalThis.isSecureContext || !globalThis.crypto?.subtle || !globalThis.indexedDB)
      throw new Error('Open this app at a secure HTTPS address in normal Safari.');
    username=normalizeUsername(username); validatePassword(password);
    const hash=await nameDigest(username);
    if(await readRecord(hash)) throw new Error('Account already exists on this device.');
    const id=crypto.randomUUID().toLowerCase();
    const salt=crypto.getRandomValues(new Uint8Array(24));
    const key=await deriveKey(password,salt);
    const record={hash,id,salt:bytesToBase64(salt),schema:1,
      proof:await encryptBytes(encoder.encode(PROOF),key,`proof:${id}`),
      vault:await sealJSON({schema:1,notes:[]},key,`vault:${id}`)};
    await writeRecord(record,true);
    this.key=key;this.record=record;this.notes=[];this.username=username;this.demo=false;
  }
  async login(username,password) {
    if (!globalThis.isSecureContext || !globalThis.crypto?.subtle || !globalThis.indexedDB)
      throw new Error('Open this app at a secure HTTPS address in normal Safari.');
    username=normalizeUsername(username);validatePassword(password);
    const record=await readRecord(await nameDigest(username));
    if(!record||!validId(record.id)||record.schema!==1) throw new Error('Incorrect account or password.');
    try {
      const key=await deriveKey(password,base64ToBytes(record.salt));
      const proof=await decryptBytes(record.proof,key,`proof:${record.id}`);
      if(decoder.decode(proof)!==PROOF) throw new Error('Invalid proof.');
      const decoded=await openJSON(record.vault,key,`vault:${record.id}`);
      if(decoded.schema!==1) throw new Error('Incompatible vault version.');
      checkNotes(decoded.notes);
      this.key=key;this.record=record;this.notes=decoded.notes;this.username=username;this.demo=false;
    } catch { this.lock(); throw new Error('Incorrect account or password, or damaged encrypted data.'); }
  }
  demoLogin() {
    this.lock();
    this.demo=true;this.username='demo';
    const now=Date.now();
    this.notes=[
      {id:'10000000-0000-4000-8000-000000000001',title:'Welcome to Labyrinth',markdown:'# Welcome to Labyrinth\n\nYour knowledge is yours. Explore the Library, Editor and interactive 3D Graph.\n\nCreate a private vault when you are ready.\n\nTry a connection: [[Projects]]\n\n## What can I do?\n- Create notes\n- Organize your ideas\n- Apply custom node colors\n- Find connections between notes',color:'#ad6afd',trashed:false,updated:now},
      {id:'10000000-0000-4000-8000-000000000002',title:'Projects',markdown:'# My Projects\n\nThis demo showcases how connected notes work.\n\nRelated: [[Welcome to Labyrinth]] and [[Ideas]]',color:'#55d4e8',trashed:false,updated:now},
      {id:'10000000-0000-4000-8000-000000000003',title:'Ideas',markdown:'# Ideas\n\nCollect inspiration here.\n\n- Create a research journal\n- Connect books to notes\n- Build a visual map of ideas\n\nSee [[Projects]].',color:'#fa9bca',trashed:false,updated:now}
    ];
  }
  async saveNotes(updated) {
    checkNotes(updated);
    if(this.demo) {this.notes=structuredClone(updated);return;}
    if(!this.key||!this.record) throw new Error('Vault locked.');
    const key=this.key,old=this.record;
    const vault=await sealJSON({schema:1,notes:updated},key,`vault:${old.id}`);
    const next={...old,vault};
    await writeRecord(next);
    this.record=next;this.notes=structuredClone(updated);
  }
  async backup() {
    if(this.demo||!this.record) throw new Error('Create a private account to export an encrypted backup.');
    const record=await readRecord(this.record.hash);
    return new Blob([JSON.stringify({format:'EOSPHORUS-WEB-BACKUP-v1',record:{...record,
      proof:bytesToBase64(new Uint8Array(record.proof)),vault:bytesToBase64(new Uint8Array(record.vault))}})],{type:'application/json'});
  }
  async restoreBackup(file) {
    if(!(file instanceof File) || file.size > LIMIT_VAULT_BYTES + 1024 * 1024) throw new Error('Backup is too large or invalid.');
    let backup;
    try { backup=JSON.parse(await file.text()); } catch { throw new Error('Encrypted backup could not be read.'); }
    if(backup?.format !== 'EOSPHORUS-WEB-BACKUP-v1') throw new Error('This is not a web-vault backup. Android backups use a different format.');
    const raw=backup.record;
    if(!raw || !/^[0-9a-f]{64}$/.test(raw.hash) || !validId(raw.id) || raw.schema!==1 ||
       typeof raw.salt!=='string' || typeof raw.proof!=='string' || typeof raw.vault!=='string') {
      throw new Error('Invalid encrypted backup metadata.');
    }
    let salt,proof,vault;
    try {salt=base64ToBytes(raw.salt);proof=base64ToBytes(raw.proof);vault=base64ToBytes(raw.vault);}catch{
      throw new Error('Invalid encrypted backup encoding.');
    }
    if(salt.length!==24 || proof.length<33 || vault.length<33 || vault.length>LIMIT_VAULT_BYTES+128 ||
       decoder.decode(proof.subarray(0,5))!=='EOSK2' || decoder.decode(vault.subarray(0,5))!=='EOSK2') {
      throw new Error('Unsupported or damaged backup.');
    }
    if(await readRecord(raw.hash))throw new Error('That account already exists on this device. Import will not overwrite it.');
    await writeRecord({hash:raw.hash,id:raw.id,salt:raw.salt,proof,vault,schema:1},true);
  }
  lock(){this.key=null;this.record=null;this.notes=[];this.username='';this.demo=false;}
}
