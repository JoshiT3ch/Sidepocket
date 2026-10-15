/** Prepare the PNG before the share click so the native sheet keeps user activation. */
export function createStoryShare({navigator=globalThis.navigator,File=globalThis.File,onState=()=>{}}={}){
  let generation=0,preparedFile=null,preparing=false,sharing=false,inFlight=null;

  const state=(phase,error)=>({phase,ready:preparedFile!==null,...(error?{error}:{})});
  const notify=(phase,error)=>{
    const result=state(phase,error);
    // A freshly rendered preview must not unlock a second native share sheet.
    if(!sharing||phase==='sharing')onState(result);
    return result;
  };
  const stale=()=>({phase:'canceled',ready:false,stale:true});

  function invalidate(){
    generation++;
    preparedFile=null;
    preparing=false;
    return sharing?state('sharing'):notify('unsupported');
  }

  function prepare(canvas,filename='sideout-story.png'){
    const current=++generation;
    preparedFile=null;
    preparing=false;
    if(typeof navigator?.share!=='function'||typeof navigator?.canShare!=='function'||typeof File!=='function'){
      return Promise.resolve(notify('unsupported'));
    }
    preparing=true;
    notify('preparing');
    return new Promise(resolve=>{
      const fail=error=>{
        if(current!==generation){resolve(stale());return;}
        preparing=false;
        resolve(notify('error',error));
      };
      try{
        canvas.toBlob(blob=>{
          if(current!==generation){resolve(stale());return;}
          if(!blob){fail(new Error('Could not create the story image.'));return;}
          try{
            const file=new File([blob],filename,{type:'image/png'});
            let supported=false;
            try{supported=navigator.canShare({files:[file]})===true;}catch{}
            preparing=false;
            if(!supported){resolve(notify('unsupported'));return;}
            preparedFile=file;
            resolve(notify('ready'));
          }catch(error){fail(error);}
        },'image/png');
      }catch(error){fail(error);}
    });
  }

  function share(){
    if(sharing)return inFlight||Promise.resolve(state('sharing'));
    if(!preparedFile)return Promise.resolve(notify('unsupported'));
    const file=preparedFile;
    sharing=true;
    notify('sharing');
    const finish=(phase,error)=>{
      sharing=false;
      inFlight=null;
      const result=notify(phase,error);
      // The old sheet may finish before a newly selected template has encoded.
      if(preparing)notify('preparing');
      return result;
    };
    const rejected=error=>error?.name==='AbortError'?finish('canceled'):finish('error',error);
    try{
      // Keep this call synchronous: rendering, fonts and PNG encoding already finished.
      const request=navigator.share({files:[file]});
      inFlight=Promise.resolve(request).then(()=>finish('handed-off'),rejected);
      return inFlight;
    }catch(error){
      return Promise.resolve(rejected(error));
    }
  }

  return {prepare,share,invalidate};
}
