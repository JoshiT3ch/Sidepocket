import test from 'node:test';
import assert from 'node:assert/strict';
import {STORY_TEMPLATES,getStoryDetails,storyFilename} from '../dist/story-card.js';

test('story cards use actual server match stats, including MMR above 5000',()=>{
  const data=getStoryDetails({name:'  Court Player  ',rating:4999,games:20,wins:20},{rating:5123,games:7,wins:4});
  assert.deepEqual(data,{name:'Court Player',rating:'5,123',games:'7',wins:'4',level:'Rating established',summary:'7 GAMES · 4 WINS'});
});

test('story cards show unavailable stats while loading instead of avatar demo values',()=>{
  const data=getStoryDetails({name:' ',rating:1200,games:50,wins:50});
  assert.equal(data.name,'Player');assert.equal(data.rating,'—');assert.equal(data.games,'—');assert.equal(data.wins,'—');
  assert.equal(data.level,'Rating loading');assert.equal(data.summary,'YOUR DOUBLES JOURNEY');
  assert.equal(getStoryDetails({},{rating:1200,games:0,wins:0}).summary,'0 GAMES · 0 WINS');
  assert.equal(getStoryDetails({},{rating:1230,games:1,wins:1}).summary,'1 GAME · 1 WIN');
});

test('story exports validate match totals and normalize template filenames',()=>{
  const data=getStoryDetails({},{rating:NaN,games:-1,wins:2});
  assert.equal(data.rating,'—');assert.equal(data.games,'—');assert.equal(data.wins,'—');
  assert.equal(getStoryDetails({},{rating:100,games:1,wins:2}).wins,'—');
  assert.deepEqual(STORY_TEMPLATES.map(item=>item.id),['rally','court','player']);
  for(const template of STORY_TEMPLATES)assert.equal(storyFilename(template.id),`sideout-${template.id}-story.png`);
  assert.equal(storyFilename('../../other'),'sideout-rally-story.png');
});
