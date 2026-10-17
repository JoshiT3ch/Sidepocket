/** Coalesce quick edits into the latest full profile; serialize writes to prevent stale saves. */
export function createProfileSaver({saveProfile,onError=()=>{},delay=250,setTimeout:schedule=globalThis.setTimeout,clearTimeout:cancel=globalThis.clearTimeout}={}) {
  let timer=null,pending=null,waiters=[],active=null,lastResult=true;
  const clearTimer=()=>{if(timer!==null){cancel(timer);timer=null;}};
  async function drain() {
    if(active){await active;if(pending&&timer===null)return drain();return lastResult;}
    if(!pending)return lastResult;
    const snapshot=pending,listeners=waiters;
    pending=null;waiters=[];
    active=Promise.resolve().then(()=>saveProfile(snapshot)).then(()=>true,error=>{
      try{onError(error);}catch{}
      return false;
    });
    lastResult=await active;
    active=null;
    for(const resolve of listeners)resolve(lastResult);
    if(pending&&timer===null)return drain();
    return lastResult;
  }
  function save(snapshot,{immediate=false}={}) {
    pending=structuredClone(snapshot);
    const result=new Promise(resolve=>waiters.push(resolve));
    clearTimer();
    if(immediate)void drain();
    else timer=schedule(()=>{timer=null;void drain();},delay);
    return result;
  }
  async function flush() {
    clearTimer();
    while(active||pending){await drain();clearTimer();}
    return lastResult;
  }
  return {save,flush};
}
