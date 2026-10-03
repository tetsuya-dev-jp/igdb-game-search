import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {connectVault} from './cdp.mjs';

const page=await connectVault();
const reportDir=process.env.E2E_REPORT_DIR||'docs/verification/automatic-time-to-beat';
const template='---\nTitle: {{title|yaml}}\nTimeToBeatMain: {{timeToBeatMain|yaml}}\nTimeToBeatAverage: {{timeToBeatAverage|yaml}}\nTimeToBeatCompletionist: {{timeToBeatCompletionist|yaml}}\nTimeToBeatList: {{timeToBeatList}}\nTimeToBeat: {{timeToBeat|json}}\nVerification: Mocked HTTP transport in real Obsidian; not live game estimates\n---\n';
try {
  await page.evaluate(`(async()=>{
    const prior=app.plugins.plugins['igdb-game-search'];
    const originalData=await prior.loadData();
    const originalEval=window.eval;
    const calls={populated:0,missing:0,failure:0};
    // Only the require('obsidian').requestUrl export supplied to this plugin
    // is replaced. Production main.js bytes, client, cache, settings migration,
    // render/create/YAML code and native Obsidian exports remain unchanged.
    window.eval=source=>{
      const compiled=originalEval(source);
      if(typeof source!=='string'||!source.includes('sourceURL=plugin:igdb-game-search'))return compiled;
      return (require,module,exports)=>compiled(id=>{
        const native=require(id);
        if(id!=='obsidian')return native;
        return {...native,requestUrl:async options=>{
          if(options.url==='https://api.igdb.com/v4/game_time_to_beats'){
            const key=options.body.includes('880001')?'populated':options.body.includes('880002')?'missing':'failure';
            calls[key]++;
            const json=key==='populated'?[{hastily:36000,normally:43200,completely:72000}]:[];
            return {status:key==='failure'?503:200,headers:{},json,text:JSON.stringify(json),arrayBuffer:new ArrayBuffer(0)};
          }
          if(options.url.startsWith('https://api.igdb.com/') || options.url.startsWith('https://id.twitch.tv/'))throw new Error('Fixture credentials must never be sent to a real server');
          return native.requestUrl(options);
        }};
      },module,exports);
    };
    try {
      await prior.saveData({...prior.settings,enableTimeToBeat:false});
      await app.plugins.disablePlugin('igdb-game-search');
      await app.plugins.enablePlugin('igdb-game-search');
      const p=app.plugins.plugins['igdb-game-search'];
      await p.loadSettings();
      window.__automaticTimeTest={originalData,calls,p};
      Object.assign(p.settings,{enableTranslation:false,enableSteam:false,enableCoverImageSave:false,enableScreenshotSave:false,
        useDefaultFrontmatter:false,templateFile:'',frontmatter:'',content:${JSON.stringify(template)},
        folder:'',fileNameFormat:'{{title}}',openPageOnCompletion:true,
        twitchClientId:'e2e-fixture-only',twitchClientSecret:'e2e-fixture-only',
        igdbAccessToken:'e2e-fixture-only',igdbAccessTokenExpiresAt:Date.now()+3600000});
      if(Object.hasOwn(p.settings,'enableTimeToBeat'))throw new Error('Legacy opt-out survived migration');
      await p.saveSettings();
      const stored=await p.loadData();
      if(Object.hasOwn(stored,'enableTimeToBeat'))throw new Error('Legacy flag persisted again');
    }catch(error){
      window.__automaticTimeTest ??= {originalData,calls,p:prior};
      await prior.saveData(originalData??{});throw error;
    }finally{window.eval=originalEval;}
  })()`);
  const records=[];
  for(const [index,kind] of ['populated','missing','failure'].entries()){
    const result=await page.evaluate(`(async()=>{
      const {p,calls}=window.__automaticTimeTest;
      const game={title:'Automatic time - ${kind}',igdbId:${880001+index}};
      const note=game.title+'.md';const old=app.vault.getAbstractFileByPath(note);if(old)await app.vault.delete(old);
      p.searchGameMetadata=async()=>({...game});
      await p.createNewGameNote();
      const file=app.vault.getAbstractFileByPath(note);if(!file)throw new Error('Note not created');
      const deadline=Date.now()+5000;
      while(!app.metadataCache.getFileCache(file)?.frontmatter){
        if(Date.now()>deadline)throw new Error('Obsidian did not index time metadata');await new Promise(r=>setTimeout(r,100));
      }
      const text=await app.vault.read(file);
      await p.getRenderedContents(game); // Cache hit for data/misses, retry for transient failure.
      return {kind:${JSON.stringify(kind)},note,text,frontmatter:app.metadataCache.getFileCache(file).frontmatter,
        requestCount:calls[${JSON.stringify(kind)}],legacyFlagPresent:Object.hasOwn(p.settings,'enableTimeToBeat'),
        plugin:p.manifest.version,windowTitle:document.title,vault:app.vault.adapter.getBasePath()};
    })()`);
    records.push(result);
    await fs.mkdir(reportDir,{recursive:true});
    await fs.writeFile(path.join(reportDir,`${kind}.md`),result.text);
    await page.screenshot(path.join(reportDir,`${process.env.E2E_DESKTOP==='1'?'desktop':'headless'}-${kind}.png`));
  }
  assert.deepEqual(records.map(r=>r.requestCount),[1,1,2]);
  for(const record of records){
    assert.equal(record.legacyFlagPresent,false);
    const expected=record.kind==='populated'?[10,12,20]:['','',''];
    assert.deepEqual([record.frontmatter.TimeToBeatMain,record.frontmatter.TimeToBeatAverage,record.frontmatter.TimeToBeatCompletionist],expected);
    assert.deepEqual(record.frontmatter.TimeToBeatList,expected);
    assert.deepEqual(record.frontmatter.TimeToBeat,{main:expected[0],average:expected[1],completionist:expected[2]});
    assert.ok(!record.text.includes('{{'));
  }
  await fs.writeFile(path.join(reportDir,`${process.env.E2E_DESKTOP==='1'?'desktop':'headless'}-automatic.json`),JSON.stringify(records,null,2)+'\n');
  console.log('PASS automatic time: real Obsidian with mocked HTTP transport; legacy OFF ignored, three metrics populated, empty/failure degradation, positive/negative cache and transient retry');
} finally {
  try {await page.evaluate(`(async()=>{
    const test=window.__automaticTimeTest;if(!test)return;
    await test.p.saveData(test.originalData??{});
    await app.plugins.disablePlugin('igdb-game-search');
    await app.plugins.enablePlugin('igdb-game-search');
    delete window.__automaticTimeTest;
  })()`);} finally {page.close();}
}
