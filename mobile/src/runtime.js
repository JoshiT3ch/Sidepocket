export const PUBLIC_ORIGIN='https://sideout-valenciacity.vercel.app';
export const AUTH_REDIRECT='com.sideout.valencia://auth/callback';
const PENDING_KEY='sideout.native.sign-in.v1';
const TTL=10*60*1000;
const PLAYER=/^SO-[A-F0-9]{12}$/i;
const DUO=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Copy only game intent; never navigate to an external origin from a link. */
export function gameDestination(input){
  let url;try{url=new URL(input);}catch{return null;}
  if(url.origin!==PUBLIC_ORIGIN||url.username||url.password||!['/','/index.html'].includes(url.pathname))return null;
  const players=url.searchParams.getAll('player'),duos=url.searchParams.getAll('duo'),rooms=url.searchParams.getAll('room');
  if(players.length>1||duos.length>1||rooms.length>1)return null;
  if(players.length&&!PLAYER.test(players[0])||duos.length&&!DUO.test(duos[0])||rooms.length&&!DUO.test(rooms[0]))return null;
  const query=new URLSearchParams();
  if(players.length)query.set('player',players[0].toUpperCase());
  if(duos.length)query.set('duo',duos[0].toLowerCase());
  if(rooms.length)query.set('room',rooms[0].toLowerCase());
  return query.size?'/?'+query+'#play':null;
}

export function callbackCode(input){
  let url;try{url=new URL(input);}catch{return null;}
  if(url.protocol!=='com.sideout.valencia:'||url.hostname!=='auth'||url.pathname!=='/callback'||url.port||url.username||url.password||url.hash)return null;
  const codes=url.searchParams.getAll('code');
  if(codes.length!==1||!codes[0]||codes[0].length>2048||url.searchParams.has('error'))return null;
  return codes[0];
}

export function createNativeRuntime({App,Browser,window,document,storage,now=Date.now}){
  let service,started=false,inFlight=null,queued=[],connecting,authError='';
  const notify=message=>{
    authError=message;
    const box=document.getElementById('auth-error');if(box){box.textContent=message;box.hidden=false;}
    const notice=document.getElementById('auth-notice');if(notice)notice.hidden=true;
  };
  const clearSignIn=()=>storage.removeItem(PENDING_KEY);
  function pending(){
    try{
      const value=JSON.parse(storage.getItem(PENDING_KEY));
      if(!value||!Number.isFinite(value.createdAt)||now()-value.createdAt>TTL||now()<value.createdAt){clearSignIn();return null;}
      // Revalidate any persisted destination before it is used.
      return{destination:value.destination?gameDestination(PUBLIC_ORIGIN+value.destination):null};
    }catch{clearSignIn();return null;}
  }
  async function handleUrl(input){
    const code=callbackCode(input);
    if(code){
      if(inFlight)return inFlight;
      const attempt=pending();if(!attempt)return;
      inFlight=(async()=>{
        try{
          // Keep the original duo/player intent in the app, away from the browser.
          // The auth controller may react to SIGNED_IN during code exchange.
          const destination=attempt.destination||'/#profile';
          window.history.replaceState(null,'',destination);
          await service.completeNativeSignIn(code);
          clearSignIn();
          await Browser.close().catch(()=>{});
          window.location.replace(destination);window.location.reload();
        }catch{
          clearSignIn();notify('Google sign-in could not finish. Please try again.');
        }finally{inFlight=null;}
      })();
      return inFlight;
    }
    let url;try{url=new URL(input);}catch{return;}
    if(url.protocol==='com.sideout.valencia:'&&url.hostname==='auth'&&url.pathname==='/callback'){
      clearSignIn();await Browser.close().catch(()=>{});notify('Google sign-in was canceled or could not finish. Please try again.');return;
    }
    const destination=gameDestination(input);
    if(destination){
      if(window.sideoutFlush&&!(await window.sideoutFlush())){notify('Save your current changes, then open the player link again.');return;}
      window.location.replace(destination);window.location.reload();
    }
  }
  const ready=(async()=>{
    // Register before asking for the launch URL, so warm callbacks cannot be lost.
    await App.addListener('appUrlOpen',({url})=>{
      if(!started)queued.push(url);else void handleUrl(url).catch(()=>notify('This link could not open. Please try again.'));
    });
    await App.addListener('backButton',async()=>{
      const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
      if(dialog){dialog.dispatchEvent(new window.Event('cancel',{cancelable:true}))&&dialog.close();return;}
      if(window.location.hash&&window.location.hash!=='#profile'&&document.getElementById('auth-view')?.hidden){window.location.hash='profile';return;}
      await App.minimizeApp();
    });
    await App.addListener('appStateChange',({isActive})=>{
      if(!isActive)return;
      // Also restores an expired attempt if the OS killed and recreated the app.
      pending();
    });
    const launch=await App.getLaunchUrl();if(launch?.url)queued.unshift(launch.url);
  })();
  // Surface setup failures through connect rather than leaving an unhandled rejection.
  ready.catch(()=>{});
  return{
    isNative:true,publicOrigin:PUBLIC_ORIGIN,authRedirect:AUTH_REDIRECT,clearSignIn,
    get authError(){return authError;},
    connect(value){
      if(!connecting)connecting=(async()=>{
        service=value;await ready;
        while(queued.length)await handleUrl(queued.shift());
        started=true;
      })();
      return connecting;
    },
    async openSignIn(input,{providerOrigin,returnTo}){
      const url=new URL(input);
      if(url.origin!==providerOrigin||url.pathname!=='/auth/v1/authorize'||url.username||url.password||url.searchParams.get('provider')!=='google'||url.searchParams.get('redirect_to')!==AUTH_REDIRECT)throw new Error('Unexpected sign-in destination.');
      const local=new URL(returnTo);
      if(local.origin!==window.location.origin)throw new Error('Unexpected return destination.');
      const destination=gameDestination(PUBLIC_ORIGIN+local.pathname+local.search+local.hash);
      authError='';
      storage.setItem(PENDING_KEY,JSON.stringify({createdAt:now(),destination}));
      try{await Browser.open({url:url.href});}catch(problem){clearSignIn();throw problem;}
    }
  };
}
