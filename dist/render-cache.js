// Keep expensive DOM/canvas work tied to the values that actually draw it.
export function createRenderCache(){
  const versions=new Map();
  return function renderChanged(section,version,draw){
    const key=JSON.stringify(version);
    if(versions.has(section)&&versions.get(section)===key)return false;
    draw();
    versions.set(section,key);
    return true;
  };
}

export function avatarAppearance(profile){
  return ['skin','shirt','paddle','hat','height','bodyType','characterType','hairStyle','hairColor','capId','shirtId','bottomId'].map(key=>profile[key]);
}
