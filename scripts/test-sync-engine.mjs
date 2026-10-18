import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

async function setup({ fail = false, switchAccount = false } = {}) {
  const writes=[], deleted=[], completed=[];
  let sessions=0;
  const pending={id:'report',inspector:'owner',ownerId:'owner',localRevision:'revision-1',version:1};
  const ops=[{id:1,type:'uploadPhoto',path:'foreign',ownerId:'other'},
    {id:2,type:'upsertInspection',inspectionId:'report',ownerId:'owner'}];
  const store={
    listOutbox:async()=>ops, updateOutbox:async(op)=>writes.push(op), deleteOutbox:async(id)=>deleted.push(id),
    getPhotoBlob:async()=>{throw new Error('A foreign photo must never be loaded');}, markPhotoSynced:async()=>{},
    getPendingInspection:async()=>pending,
    completePendingInspection:async(...args)=>completed.push(args), outboxStats:async()=>({total:1,failed:0}),
    resetOutboxBackoff:async()=>{},requestPersistentStorage:async()=>{},
  };
  const supabase={auth:{getSession:async()=>({data:{session:{user:{id:switchAccount && ++sessions>1?'other':'owner'}}}})}};
  const adapter={upsertInspection:async(row)=>{if(fail)throw new Error('permission denied');writes.push(row);return{version:2};}};
  const context=createContext({navigator:{onLine:true},console,setTimeout,clearTimeout,Date});
  const source=await readFile(new URL('../apps/web/src/services/syncEngine.js',import.meta.url),'utf8');
  const module=new SourceTextModule(source,{context});
  await module.link((specifier)=>{
    const values=specifier.includes('supabaseClient')?{supabase,isSupabaseConfigured:true,SUPABASE_PHOTO_BUCKET:'inspection-photos'}:
      specifier.includes('dataService')?{default:adapter}:store;
    return new SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});
  });
  await module.evaluate();
  return {drain:module.namespace.drainOutbox,writes,deleted,completed};
}

test('sync skips another account and acknowledges only the uploaded report revision',async()=>{
  const state=await setup();await state.drain();
  assert.equal(state.writes.length,1);
  assert.equal(state.writes[0].id,'report');
  assert.deepEqual(state.deleted,[2]);
  assert.deepEqual(state.completed,[['report','revision-1',2]]);
});
test('failed sync retains the report and adds retry backoff',async()=>{
  const state=await setup({fail:true});await state.drain();
  assert.deepEqual(state.deleted,[]);assert.deepEqual(state.completed,[]);
  assert.equal(state.writes[0].tries,1);assert.ok(state.writes[0].nextAttemptAt>Date.now());
});
test('account change during a drain stops before sending another operation',async()=>{
  const state=await setup({switchAccount:true});await state.drain();
  assert.deepEqual(state.writes,[]);assert.deepEqual(state.deleted,[]);
});
