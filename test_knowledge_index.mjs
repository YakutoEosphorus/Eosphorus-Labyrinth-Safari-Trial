import test from 'node:test';
import assert from 'node:assert/strict';
import {KnowledgeIndex,tagsFor,sanitizedFeedback} from './knowledge_index.js';
const n=(id,title,markdown,trashed=false)=>({id,title,markdown,trashed});
test('backlinks and tag collections are isolated',()=>{
 const index=new KnowledgeIndex([n('a','AI','# Study\n#ai [[OS]]'),n('b','OS','[[AI]] #os'),n('c','Orphan','Unlinked'),n('t','Trashed','[[AI]]',true)]);
 assert.deepEqual(index.incoming('a').map(x=>x.title),['OS']);
 assert.deepEqual(index.outgoing('a').map(x=>x.title),['OS']);
 assert.deepEqual(index.collection('tag:ai').map(x=>x.id),['a']);
 assert.deepEqual(index.collection('Orphan notes').map(x=>x.id),['c']);
 assert.equal(index.search('tag:ai').length,1);
 assert.deepEqual(new KnowledgeIndex([n('e','Else','Nothing')]).incoming('a'),[]);
});
test('headings do not count as tags',()=>{
 assert.deepEqual([...tagsFor('# Header\n#tag #ai')].sort(),['ai','tag']);
});
test('anonymous report never includes note or identity fields',()=>{
 const report=sanitizedFeedback();
 assert.deepEqual(Object.keys(report).sort(),['schema','platform','version','features','collection','includes_note_text','includes_account_details','uploads_to_server'].sort());
 assert.equal(JSON.stringify(report).includes('password'),false);
});
