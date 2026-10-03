import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {connectVault} from './cdp.mjs';

const readme=await fs.readFile(new URL('../README.md',import.meta.url),'utf8');
const recipe=readme.match(/#### Templater recipe[\s\S]*?```md\n([\s\S]*?)\n```/)?.[1];
assert.ok(recipe,'README copy-paste Templater recipe exists');
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/resident-evil-requiem.json',import.meta.url),'utf8'));
const page=await connectVault();
const reports=[];
try {
  for (const auto of [false,true]) {
    const result=await page.evaluate(`(async()=>{
      const p=app.plugins.plugins['igdb-game-search'];
      const tp=app.plugins.plugins['templater-obsidian'];
      if(!tp) throw new Error('Official Templater must be installed and enabled');
      const originalSettings={...p.settings};const originalSearch=p.searchGameMetadata;
      const local=app.loadLocalStorage('templater-local-settings');
      const oldFolder=tp.settings.templates_folder;
      const oldLegacy=tp.settings.trigger_on_file_creation;
      app.saveLocalStorage('templater-local-settings',{...(local??{}),trigger_on_file_creation:${auto}});
      if(typeof oldLegacy==='boolean') tp.settings.trigger_on_file_creation=${auto};
      tp.settings.templates_folder='Templates';
      window.__igdbTemplateExecutions=0;
      const name='Resident Evil Requiem - templater-${auto?'auto':'manual'}';
      const template='Requiem Templater verification.md';
      const text=${JSON.stringify(recipe.replace('<%*','<%*\nwindow.__igdbTemplateExecutions++;'))};
      const prior=app.vault.getAbstractFileByPath(template);
      if(prior) await app.vault.modify(prior,text);else await app.vault.create(template,text);
      const old=app.vault.getAbstractFileByPath(name+'.md');if(old)await app.vault.delete(old);
      const deadline=Date.now()+5000;
      while(!app.metadataCache.getFirstLinkpathDest(template,'')){
        if(Date.now()>deadline)throw new Error('Template not indexed');await new Promise(r=>setTimeout(r,100));
      }
      Object.assign(p.settings,{templateFile:template,enableTranslation:false,enableSteam:false,
        folder:'',fileNameFormat:name,enableCoverImageSave:true,enableScreenshotSave:true,
        coverImagePath:'00 - Atlas/Archive/Attachments/09 - The Arcade',screenshotImagePath:'00 - Atlas/Archive/Attachments/09 - The Arcade',openPageOnCompletion:true});
      p.searchGameMetadata=async()=>structuredClone(${JSON.stringify(fixture.game)});
      try{
        await p.createNewGameNote();
        const file=app.vault.getAbstractFileByPath(name+'.md');if(!file)throw new Error('Game note not created');
        const until=Date.now()+12000;
        let finalText;
        while(true){
          finalText=await app.vault.read(file);
          const fm=app.metadataCache.getFileCache(file)?.frontmatter;
          if(!finalText.includes('<%')&&fm?.Genre)break;
          if(Date.now()>until)throw new Error('Templater did not execute README recipe');await new Promise(r=>setTimeout(r,100));
        }
        // The auto-trigger waits 300ms; catch late double execution too.
        await new Promise(r=>setTimeout(r,700));
        return {text:finalText,frontmatter:app.metadataCache.getFileCache(file).frontmatter,
          executions:window.__igdbTemplateExecutions,auto:${auto},templater:tp.manifest.version,
          note:file.path,vault:app.vault.adapter.getBasePath(),windowTitle:document.title};
      }finally{p.settings=originalSettings;p.searchGameMetadata=originalSearch;
        app.saveLocalStorage('templater-local-settings',local);tp.settings.templates_folder=oldFolder;
        if(typeof oldLegacy==='boolean')tp.settings.trigger_on_file_creation=oldLegacy;delete window.__igdbTemplateExecutions;}
    })()`);
    assert.equal(result.executions,1,'README recipe executes once, without auto/manual duplication');
    assert.deepEqual(result.frontmatter.Genre,fixture.game.genres);
    assert.deepEqual(result.frontmatter.Platform,fixture.game.platforms);
    assert.equal(result.frontmatter.Title,fixture.game.title);
    assert.equal(result.frontmatter.Developer,fixture.game.developers[0]);
    assert.equal(result.frontmatter.Publisher,fixture.game.publishers[0]);
    assert.match(result.frontmatter.Cover,/^\[\[.*\.jpg\]\]$/);
    assert.match(result.frontmatter.Backdrop,/^\[\[.*screenshot-01(?:-\d+)?\.jpg\]\]$/);
    assert.equal(result.frontmatter.StoreUrl,fixture.game.websites[1]);
    assert.equal(result.frontmatter.Metacritic,333);
    assert.match(result.text,/Title: Resident Evil Requiem/);
    assert.match(result.text,/Genre:\n {2}- "Shooter"\n {2}- "Puzzle"\n {2}- "Adventure"/);
    assert.ok(!result.text.includes('{{'),'Named vars all resolve before Templater');
    reports.push(result);
    console.log(`PASS README Templater recipe: real block lists, first names, wikilinks, Steam URL, quote control, exactly one execution (auto=${auto}, Templater ${result.templater})`);
  }
  const dir=process.env.E2E_REPORT_DIR||'docs/verification/automatic-time-to-beat';await fs.mkdir(dir,{recursive:true});
  const suffix=process.env.E2E_DESKTOP==='1'?'desktop':'headless';
  await fs.writeFile(path.join(dir,`templater-${suffix}.json`),JSON.stringify(reports,null,2)+'\n');
  await fs.writeFile(path.join(dir,'templater-after.md'),reports[1].text);
  await page.screenshot(path.join(dir,`templater-${suffix}.png`));
}finally{page.close();}
