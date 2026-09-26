// Test-only adapter. Production always uses Firestore and verified Firebase ID tokens.
export class MemoryStore {
  data = new Map();
  queue = Promise.resolve();
  async get(path) { return structuredClone(this.data.get(path) || null); }
  async list(collection, opts = {}) {
    let rows = [...this.data].filter(([p])=>p.startsWith(collection+'/') && p.split('/').length === collection.split('/').length+1).map(([p,v])=>({...structuredClone(v),id:p.split('/').at(-1)}));
    for (const [k,op,v] of opts.where || []) { if(op !== '==')throw Error('unsupported'); rows=rows.filter(x=>x[k]===v); }
    const k=opts.orderBy==='__name__'||!opts.orderBy?'id':opts.orderBy, direction=opts.direction==='desc'?-1:1;
    rows.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*direction);
    if(opts.after)rows=rows.filter(x=>String(x[k]).localeCompare(opts.after)*direction>0);
    return rows.slice(0,opts.limit || 20);
  }
  async listGroup(collectionId, opts = {}) {
    let rows=[...this.data].filter(([p])=>p.split('/').at(-2)===collectionId).map(([p,v])=>({...structuredClone(v),id:p.split('/').at(-1),path:p}));
    for (const [k,op,v] of opts.where || []) { if(op !== '==')throw Error('unsupported'); rows=rows.filter(x=>x[k]===v); }
    return rows.slice(0,opts.limit || 100);
  }
  async listIds(collection, prefix, limit = 100) {
    return [...this.data.keys()].filter(p=>p.startsWith(collection+'/'+prefix)&&p.split('/').length===collection.split('/').length+1).map(p=>p.split('/').at(-1)).slice(0,limit);
  }
  async purge(path) {
    await this.transaction(async tx=>{ for (const p of [...this.data.keys()]) if(p===path||p.startsWith(path+'/')) tx.delete(p); });
  }
  transaction(fn) {
    const job=this.queue.then(async()=>{
      const copy=new Map(structuredClone([...this.data]));
      let writes=false;
      const result=await fn({get:async p=>{if(writes)throw Error('Firestore requires reads before writes');return structuredClone(copy.get(p)||null);},set:(p,v)=>{writes=true;copy.set(p,structuredClone(v));},delete:p=>{writes=true;copy.delete(p);}});
      this.data=copy;return result;
    });
    this.queue=job.catch(()=>{});return job;
  }
}
