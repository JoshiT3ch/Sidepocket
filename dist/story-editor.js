import {STORY_TEMPLATES,drawStoryCard,storyFilename,getStoryDetails} from './story-card.js';
import {createStoryShare} from './story-share.js';
import {createRenderCache,avatarAppearance} from './render-cache.js';

// Loaded when the player first opens the editor. Keep PNG export and device
// sharing together so normal page navigation does no story rendering work.
export function createStoryEditor({getProfile,getStats,defaultName,toast}){
  const dialog=document.getElementById('story-dialog'),templateChoices=document.getElementById('story-templates');
  const shareButton=document.getElementById('share-story'),shareLabel=document.getElementById('share-story-label');
  const shareStatus=document.getElementById('story-share-status'),fallback=document.getElementById('story-share-fallback');
  const renderChanged=createRenderCache();
  let selected=STORY_TEMPLATES[0].id,manualShareRequested=false,preparedVersion;
  const share=createStoryShare({onState:({phase})=>{
    shareButton.disabled=phase==='preparing'||phase==='sharing';
    shareLabel.textContent=phase==='preparing'?'Preparing your card…':phase==='sharing'?'Sharing…':'Share story card';
    const messages={
      preparing:'Getting your selected card ready to share.',
      ready:'Ready. Choose Instagram or Stories in your phone’s share menu, if available.',
      unsupported:'This browser can’t share images directly. Save the PNG, then add it to your Instagram Story.',
      error:'Sharing couldn’t open. Try again, or save the PNG and add it in Instagram.',
      sharing:'Choose Instagram or Stories in the share menu, if available.',
      'handed-off':'Your card was handed to your device. Finish sharing in the app you chose.',
      canceled:'Sharing canceled. Your card is still here when you’re ready.'
    };
    shareStatus.textContent=messages[phase]||'';
    if(phase==='ready')fallback.hidden=true;
    if(manualShareRequested&&(phase==='unsupported'||phase==='error'))fallback.hidden=false;
  }});
  function contentVersion(){const profile=getProfile();return [avatarAppearance(profile),getStoryDetails(profile,getStats())];}
  function render(){
    const profile=getProfile(),stats=getStats(),version=contentVersion();
    renderChanged('thumbnails',version,()=>{
      const source=document.createElement('canvas');
      for(const choice of STORY_TEMPLATES){
        const thumbnail=templateChoices.querySelector(`[data-story-template="${choice.id}"] canvas`),ctx=thumbnail.getContext('2d');
        drawStoryCard(source,{profile,stats,template:choice.id});
        ctx.clearRect(0,0,thumbnail.width,thumbnail.height);ctx.drawImage(source,0,0,thumbnail.width,thumbnail.height);
      }
      // Release the temporary full-size backing store after downsampling.
      source.width=1;source.height=1;
    });
    for(const button of templateChoices.children)button.setAttribute('aria-pressed',String(selected===button.dataset.storyTemplate));
    renderChanged('main',[version,selected],()=>{
      const canvas=drawStoryCard(document.getElementById('story-canvas'),{profile,stats,template:selected});
      const choice=STORY_TEMPLATES.find(item=>item.id===selected);
      canvas.setAttribute('aria-label',`${choice.name} story card for ${profile.name.trim()||defaultName}, with your pixel character and current doubles rating`);
    });
  }
  function prepare(){share.prepare(document.getElementById('story-canvas'),storyFilename(selected));preparedVersion=JSON.stringify([contentVersion(),selected]);}
  for(const choice of STORY_TEMPLATES){
    const button=document.createElement('button');button.type='button';button.className='story-template';button.dataset.storyTemplate=choice.id;
    button.setAttribute('aria-pressed',String(selected===choice.id));button.setAttribute('aria-controls','story-canvas');
    const thumbnail=document.createElement('canvas');thumbnail.width=108;thumbnail.height=192;thumbnail.setAttribute('aria-hidden','true');
    const copy=document.createElement('span');copy.className='story-template-copy';
    const name=document.createElement('strong');name.textContent=choice.name;
    const description=document.createElement('span');description.textContent=choice.description;copy.append(name,description);
    const check=document.createElement('span');check.className='story-template-check';check.textContent='✓';check.setAttribute('aria-hidden','true');
    button.append(thumbnail,copy,check);button.addEventListener('click',()=>{if(selected===choice.id)return;selected=choice.id;render();prepare();document.getElementById('story-selection-status').textContent=choice.name+' selected.';});templateChoices.append(button);
  }
  shareButton.addEventListener('click',()=>{manualShareRequested=true;share.share();});
  dialog.addEventListener('close',()=>{share.invalidate();manualShareRequested=false;fallback.hidden=true;});
  document.getElementById('share-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();}});
  document.getElementById('download-story').addEventListener('click',async()=>{
    const button=document.getElementById('download-story');button.disabled=true;
    const template=selected,profile=structuredClone(getProfile()),stats=getStats()?structuredClone(getStats()):null;
    try{
      if(document.fonts)await document.fonts.ready;
      const canvas=drawStoryCard(document.createElement('canvas'),{profile,stats,template});
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('Could not create the card.');
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=storyFilename(template);document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Story card downloaded. Upload it to your story.');
    }catch{toast('Could not create the card. Please try again.');}
    finally{button.disabled=false;}
  });
  return{
    async open(){if(document.fonts)await document.fonts.ready;render();prepare();if(!dialog.open)dialog.showModal();},
    refresh(){
      if(!dialog.open)return;
      const version=JSON.stringify([contentVersion(),selected]);
      if(preparedVersion===version)return;
      render();prepare();preparedVersion=version;
    }
  };
}
