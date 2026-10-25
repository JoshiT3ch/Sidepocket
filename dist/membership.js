const planDetails={
  player:{title:'Get verified as a player',price:'₱139 / month',copy:'Add a Verified Player checkmark and host games for your crew. This player membership is separate from Court Owner access.',status:'Subscriptions are coming soon. Secure checkout is awaiting PayMongo activation.'},
  owner:{title:'Court Owner membership',price:'₱1,000 / month',copy:'The Court Owner plan is being prepared for club listings, numbered courts, photos, owner-set prices and reservation tools. Ownership review is required. A ₱139 player membership is not required to manage your courts.',status:'Court Owner memberships and paid court bookings are coming soon. Checkout will open after payment and owner-payout activation.'}
};

// Plan information only. Payment returns, clicks and profile edits never grant a badge.
export function initMembership({document:doc=globalThis.document,profile={},onNavigate=()=>{},now=Date.now}={}){
  const get=id=>doc.getElementById(id),root=get('membership'),dialog=get('membership-dialog');
  if(!root||!dialog)return{handleNavigation(){},openPlan(){},destroy(){}};
  let active=false,destroyed=false,opener=null,selected='player';
  const cleanup=[];
  const listen=(node,type,fn)=>{if(node){node.addEventListener(type,fn);cleanup.push(()=>node.removeEventListener(type,fn));}};
  const verified=()=>profile.isVerified===true&&Number.isFinite(Date.parse(profile.verifiedUntil))&&Date.parse(profile.verifiedUntil)>now();
  const expiry=()=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'long',day:'numeric'}).format(new Date(profile.verifiedUntil));
  function render(){
    const current=verified();
    get('membership-account-status').textContent=current?`✓ Your Verified Player checkmark is active until ${expiry()}. Court Owner access is separate.`:'Your current account is a free player account. Membership checkout is being activated.';
    get('membership-player-status').textContent=current?'Your player checkmark is active. Online subscription checkout is coming soon.':'Player subscription checkout is awaiting PayMongo activation.';
    const playerAction=get('membership-player-action-label');if(playerAction)playerAction.textContent=current?'View player plan':'Get verified';
  }
  function restoreFocus(){
    if(destroyed)return;
    const canFocus=node=>node?.isConnected&&!node.disabled&&!node.closest('[hidden]');
    const fallback=[...doc.querySelectorAll(`[data-membership-plan="${selected}"]`)].find(canFocus);
    (canFocus(opener)?opener:fallback)?.focus();opener=null;
  }
  function close(){if(dialog.open)dialog.close();}
  function openPlan(plan,trigger){
    if(destroyed||!Object.hasOwn(planDetails,plan))return;
    selected=plan;opener=trigger||doc.activeElement;
    if(!active)onNavigate('membership');
    render();const details=planDetails[plan];
    get('membership-dialog-title').textContent=plan==='player'&&verified()?'Your Verified Player account':details.title;
    get('membership-dialog-price').textContent=details.price;
    get('membership-dialog-copy').textContent=plan==='player'&&verified()?`Your player checkmark is currently active until ${expiry()}. Court Owner membership remains a separate plan.`:details.copy;
    get('membership-dialog-status').textContent=details.status;
    get('membership-checkout').disabled=true;
    if(!dialog.open)dialog.showModal();get('membership-dialog-close').focus();
  }
  listen(get('membership-dialog-close'),'click',close);
  doc.querySelectorAll('[data-membership-close]').forEach(button=>listen(button,'click',close));
  listen(dialog,'close',restoreFocus);
  return{
    handleNavigation(page){active=page==='membership';if(active)render();else close();},
    openPlan,
    destroy(){destroyed=true;close();cleanup.forEach(fn=>fn());opener=null;}
  };
}
