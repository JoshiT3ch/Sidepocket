// The website keeps one transport contract for its local preview and hosted account service.
export class ServiceError extends Error {
  constructor(message,status=400){super(message);this.name='ServiceError';this.status=status;}
}

function requestBody(options){
  if(options.body===undefined)return {};
  let body;try{body=typeof options.body==='string'?JSON.parse(options.body):options.body;}catch{throw new ServiceError('Please send valid form data.');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new ServiceError('Please send valid form data.');
  return body;
}
function endpoint(path,options){
  const method=(options.method||'GET').toUpperCase();
  if(typeof path!=='string'||!path.startsWith('/api/')||/[?#]/.test(path))throw new ServiceError('This action is not available.',404);
  const body=requestBody(options);
  if(path==='/api/auth/session'&&method==='GET')return{auth:'session'};
  if(path==='/api/auth/signup'&&method==='POST')return{auth:'signup',body};
  if(path==='/api/auth/login'&&method==='POST')return{auth:'login',body};
  if(path==='/api/auth/logout'&&method==='POST')return{auth:'logout'};
  if(path==='/api/profile'&&method==='GET')return{rpc:'sideout_profile',args:{},profile:true};
  if(path==='/api/profile'&&method==='PUT')return{rpc:'sideout_save_profile',args:{p_profile:body},save:true};
  if(path==='/api/play'&&method==='GET')return{rpc:'sideout_play',args:{}};
  const player=path.match(/^\/api\/players\/(SO-[A-F0-9]{12})$/);
  if(player&&method==='GET')return{rpc:'sideout_player',args:{p_code:player[1]}};
  if(path==='/api/duos'&&method==='POST')return{rpc:'sideout_duo_invite',args:{p_code:body.playerCode}};
  if(path==='/api/duos/leave'&&method==='POST')return{rpc:'sideout_duo_leave',args:{}};
  if(path==='/api/matches'&&method==='POST')return{rpc:'sideout_match_create',args:{p_code:body.playerCode}};
  const action=path.match(/^\/api\/(duos|matches)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(respond|result|cancel)$/i);
  if(action&&method==='POST'){
    const [,kind,id,verb]=action;
    if(kind==='duos'&&verb==='respond')return{rpc:'sideout_duo_respond',args:{p_id:id,p_accept:body.accept}};
    if(kind==='matches'&&verb==='respond')return{rpc:'sideout_match_respond',args:{p_id:id,p_accept:body.accept}};
    if(kind==='matches'&&verb==='result')return{rpc:'sideout_match_result',args:{p_id:id,p_winner:body.winnerSide}};
    if(kind==='matches'&&verb==='cancel')return{rpc:'sideout_match_cancel',args:{p_id:id}};
  }
  throw new ServiceError('This action is not available.',404);
}
function publicUser(user){
  if(!user)return null;
  return{id:user.id,email:user.email||'',name:String(user.user_metadata?.name||'Player').slice(0,24)};
}
function providerError(error){
  const unauthenticated=[401,'401'].includes(error.status)||['PGRST301','PGRST303','bad_jwt','session_not_found','refresh_token_not_found','refresh_token_already_used'].includes(error.code)||error.name==='AuthSessionMissingError';
  return new ServiceError(unauthenticated?'Please log in to continue.':error.message||'That action could not be completed. Try again.',unauthenticated?401:Number(error.status)||400);
}
function confirmationRedirect(location){
  const url=new URL(location?.href||'http://localhost:3000/');
  const player=url.searchParams.get('player')?.toUpperCase();
  url.search='';url.hash='#profile';
  if(/^SO-[A-F0-9]{12}$/.test(player||'')){url.searchParams.set('player',player);url.hash='#play';}
  return url.href;
}

export function createService(config,{createClient,fetchImpl=globalThis.fetch,location=globalThis.location}={}){
  if(config?.provider==='local')return{
    provider:'local',
    onAuthStateChange:()=>({unsubscribe(){}}),
    async request(path,options={}){
      endpoint(path,options);
      let response;try{response=await fetchImpl(path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Sideout-Request':'1',...options.headers}});}catch{throw new ServiceError('Could not connect. Start the website server and try again.',503);}
      let data;try{data=await response.json();}catch{throw new ServiceError('The account service is unavailable. Please try again.',503);}
      if(!response.ok)throw new ServiceError(data.error||'Please try again.',response.status);
      return data;
    }
  };
  if(config?.provider!=='supabase')throw new ServiceError('The website connection has not been configured.',503);
  let url;try{url=new URL(config.url);}catch{throw new ServiceError('The website connection has not been configured.',503);}
  if(url.protocol!=='https:'||url.username||url.password||!/^[-a-z0-9]+\.supabase\.(co|net)$/i.test(url.hostname)||!['','/'].includes(url.pathname)||url.search||url.hash||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey||''))throw new ServiceError('A public Supabase connection is required for this website.',503);
  if(typeof createClient!=='function')throw new ServiceError('The account service could not load. Please refresh.',503);
  const client=createClient(url.origin,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});
  return{
    provider:'supabase',
    onAuthStateChange(callback){
      // Supabase invokes this under its session lock; subscribers stay synchronous.
      const {data}=client.auth.onAuthStateChange(callback);
      return data.subscription;
    },
    async request(path,options={}){
      const route=endpoint(path,options);
      if(route.auth==='session'){
        // getSession waits for URL callback initialization; getUser verifies identity online.
        const current=await client.auth.getSession();
        if(current.error)throw providerError(current.error);
        if(!current.data?.session)return{user:null};
        const verified=await client.auth.getUser();
        if(verified.error){
          const error=providerError(verified.error);
          if(error.status===401){await client.auth.signOut({scope:'local'});return{user:null};}
          throw error;
        }
        return{user:publicUser(verified.data?.user)};
      }
      if(route.auth==='signup'){
        const {email,password,name}=route.body;
        const result=await client.auth.signUp({email:String(email||'').trim().toLowerCase(),password,options:{data:{name:String(name||'').trim()},emailRedirectTo:confirmationRedirect(location)}});
        if(result.error)throw providerError(result.error);
        return{user:publicUser(result.data?.user),requiresConfirmation:!result.data?.session};
      }
      if(route.auth==='login'){
        const result=await client.auth.signInWithPassword({email:String(route.body.email||'').trim().toLowerCase(),password:route.body.password});
        if(result.error)throw providerError(result.error);
        return{user:publicUser(result.data?.user)};
      }
      if(route.auth==='logout'){
        const result=await client.auth.signOut({scope:'local'});
        if(result.error)throw providerError(result.error);
        return{ok:true};
      }
      const result=await client.rpc(route.rpc,route.args);
      if(result.error)throw providerError(result.error);
      if(route.profile)return{profile:result.data};
      if(route.save)return{ok:true};
      return result.data;
    }
  };
}

let servicePromise;
export function getService(){
  if(!servicePromise)servicePromise=(async()=>{
    const module=await import('./connection.js');
    const config=module.default||module.connection;
    let createClient;
    if(config?.provider==='supabase')({createClient}=await import('./vendor/supabase-2.117.3.js'));
    return createService(config,{createClient});
  })();
  return servicePromise;
}
