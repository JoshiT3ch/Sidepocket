import {drawAvatar} from './pixel-player.js';

const el=(tag,className='',text='')=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==''&&text!=null)node.textContent=String(text);return node;};
const number=value=>Number(value).toLocaleString();
const winRate=player=>player.games?`${Math.round(player.wins/player.games*100)}%`:'—';
const isSame=(a,b)=>Boolean(a&&b&&((a.id&&a.id===b.id)||(a.code&&a.code===b.code)));

export function initLeaderboard({onNavigate=()=>{},request=(...args)=>window.sideoutService.request(...args)}={}){
  const root=document.getElementById('leaderboard');
  if(!root)return{refresh:async()=>{}};
  const byId=id=>document.getElementById(id);
  const refreshButton=byId('refresh-leaderboard');
  const retryButton=byId('retry-leaderboard');
  const notice=byId('leader-notice');
  let refreshing=null;
  const person=player=>{
    const group=el('div','leader-person');
    const canvas=el('canvas','leader-avatar');canvas.width=112;canvas.height=144;canvas.setAttribute('aria-hidden','true');
    try{drawAvatar(canvas.getContext('2d'),48,138,1.12,player.avatar||{});}catch{canvas.hidden=true;}
    const copy=el('div','leader-person-copy');copy.append(el('strong','',player.name||'Player'));if(player.isVerified===true)copy.append(el('span','player-verified','✓ Verified'));
    group.append(canvas,copy);return group;
  };
  const playerRow=(entry,me)=>{
    const player=entry.player,mine=isSame(player,me);
    const row=el('tr',`leader-row${mine?' leader-row-mine':''}`);
    const position=el('th','leader-position');position.scope='row';
    const rank=el('span',`leader-rank${entry.rank<=3?' leader-rank-top leader-rank-'+entry.rank:''}`,`#${number(entry.rank)}`);position.append(rank);
    const name=el('td','leader-player-cell');const identity=person(player);
    if(mine)identity.lastElementChild.append(el('span','leader-you','You'));
    name.append(identity);
    const rating=el('td','leader-mmr',number(player.rating));rating.dataset.label='MMR';
    const games=el('td','leader-games',number(player.games));games.dataset.label='Played';
    const wins=el('td','leader-wins',number(player.wins));wins.dataset.label='Won';
    const rate=el('td','leader-win-rate',winRate(player));rate.dataset.label='Win rate';
    row.append(position,name,rating,games,wins,rate);return row;
  };
  const render=data=>{
    if(!Array.isArray(data?.entries)||!data.me?.player||!Number.isInteger(data.rankedPlayers))throw new Error('The leaderboard is unavailable right now. Please try again.');
    const {entries,me,rankedPlayers}=data;
    const own=byId('leader-own-person');own.replaceChildren(person(me.player));
    own.firstElementChild.lastElementChild.append(el('span','leader-own-mmr',`${number(me.player.rating)} MMR`));
    byId('leader-own-rank').textContent=me.rank==null?'Unranked':`#${number(me.rank)}`;
    byId('leader-own-rank').classList.toggle('leader-unranked',me.rank==null);
    byId('leader-own-note').textContent=me.rank==null?'One rated game. Your place on the board.':`${number(me.player.wins)} ${me.player.wins===1?'win':'wins'} · ${number(me.player.games)} ${me.player.games===1?'game':'games'} · ${winRate(me.player)} win rate`;
    byId('leader-total').textContent=number(rankedPlayers);
    byId('leader-total-label').textContent=rankedPlayers===1?'ranked player':'ranked players';
    byId('leader-overview').hidden=false;
    const rows=byId('leader-rows');rows.replaceChildren();
    for(const entry of entries)rows.append(playerRow(entry,me.player));
    const ownOutside=me.rank!=null&&!entries.some(entry=>isSame(entry.player,me.player));
    if(ownOutside){
      const divider=el('tr','leader-own-divider');const cell=el('td','','Your place on the board');cell.colSpan=6;divider.append(cell);rows.append(divider,playerRow(me,me.player));
    }
    byId('leader-empty').hidden=rankedPlayers!==0;
    byId('leader-table-wrap').hidden=rankedPlayers===0;
    const listNote=byId('leader-list-note');listNote.hidden=rankedPlayers===0;
    listNote.textContent=rankedPlayers>entries.length?`Showing the top ${number(entries.length)} of ${number(rankedPlayers)} players.${ownOutside?' Your position is included below.':''}`:`${number(rankedPlayers)} ${rankedPlayers===1?'player':'players'}. Ranked by MMR, refreshed when you visit.`;
    notice.textContent=rankedPlayers===0?'The board is open. Make the first game count.':'Latest ratings loaded. Equal MMR shares a rank.';
  };
  const refresh=()=>{
    if(refreshing)return refreshing;
    root.setAttribute('aria-busy','true');refreshButton.disabled=true;retryButton.disabled=true;
    byId('leader-error').hidden=true;notice.textContent='Loading the local leaderboard…';
    refreshing=(async()=>{
      try{render(await Promise.resolve().then(()=>request('/api/leaderboard')));}
      catch(error){
        byId('leader-overview').hidden=true;byId('leader-empty').hidden=true;byId('leader-table-wrap').hidden=true;byId('leader-list-note').hidden=true;
        byId('leader-error-message').textContent=error?.status===401?'Your session has ended. Refresh the page to sign in again.':'Please check your connection and try again. Your games and rating are safe.';
        byId('leader-error').hidden=false;notice.textContent='The leaderboard could not be refreshed.';
      }
      finally{root.setAttribute('aria-busy','false');refreshButton.disabled=false;retryButton.disabled=false;refreshing=null;}
    })();
    return refreshing;
  };
  refreshButton.addEventListener('click',refresh);retryButton.addEventListener('click',refresh);
  byId('leader-first-game').addEventListener('click',()=>onNavigate('play'));
  byId('leader-rating-rules').addEventListener('click',()=>onNavigate('rating'));
  return{refresh};
}
