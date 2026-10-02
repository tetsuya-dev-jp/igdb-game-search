import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { connectVault } from './cdp.mjs';

const fixture = JSON.parse(await fs.readFile(new URL('./fixtures/resident-evil-requiem.json', import.meta.url), 'utf8'));
const template = `---
Title: {{title}}
Cover: {{localCoverWikilink|yaml}}
Backdrop: {{firstScreenshotWikilink|yaml}}
Platform: {{platforms|yaml}}
Developer: {{developers|first}}
Publisher: {{publishers|first}}
Genre: {{genres|yaml}}
ReleaseDate: {{firstReleaseDate}}
Metacritic: {{totalRatingCount}}
StoreUrl: {{steamStoreUrl|yaml}}
TimeToBeatMain: "{{timeToBeatMain}}"
TimeToBeatAverage: "{{timeToBeatAverage}}"
TimeToBeatCompletionist: "{{timeToBeatCompletionist}}"
SteamPlaytimeHours: "{{steamPlaytimeHours}}"
SteamAchievements: {{steamAchievements}}
---

# {{title}}

API-credential-free verification using the public-source fixture in e2e/fixtures/.
No personal Steam playtime or authenticated IGDB times are asserted.

!{{localCoverWikilink}}
!{{firstScreenshotWikilink}}
`;
const page = await connectVault();
const reportDir = process.env.E2E_REPORT_DIR || 'docs/verification/issues-2-4';
try {
  const result = await page.evaluate(`(async () => {
    const p = app.plugins.plugins['igdb-game-search'];
    if (!p) throw new Error('Plugin not loaded');
    const originalSearch = p.searchGameMetadata;
    const originalSettings = {...p.settings};
    const game = ${JSON.stringify(fixture.game)};
    const note = 'Resident Evil Requiem - after.md';
    const temp = 'Enrichment verification template.md';
    const old = app.vault.getAbstractFileByPath(note);
    if (old) await app.vault.delete(old);
    const oldTemplate = app.vault.getAbstractFileByPath(temp);
    if (oldTemplate) await app.vault.delete(oldTemplate);
    await app.vault.create(temp, ${JSON.stringify(template)});
    // Let the real metadata cache discover the template file.
    const deadline = Date.now()+5000;
    while (!app.metadataCache.getFirstLinkpathDest(temp,'')) {
      if (Date.now()>deadline) throw new Error('Template not indexed');
      await new Promise(r=>setTimeout(r,100));
    }
    Object.assign(p.settings,{enableTranslation:false,enableTimeToBeat:true,enableSteam:true,
      steamApiKeySecretName:'', steamProfile:'',
      templateFile:temp, folder:'', fileNameFormat:'{{title}} - after',
      enableCoverImageSave:true,coverImagePath:'00 - Atlas/Archive/Attachments/09 - The Arcade',
      enableScreenshotSave:true,screenshotImagePath:'00 - Atlas/Archive/Attachments/09 - The Arcade',
      openPageOnCompletion:true});
    // The selection seam is supplied by a documented public-source fixture.
    // The actual createNewGameNote/render/download/vault-write pipeline runs.
    p.searchGameMetadata = async () => structuredClone(game);
    try {
      await p.createNewGameNote();
      const file=app.vault.getAbstractFileByPath(note);
      if (!file) throw new Error('createNewGameNote did not create the note');
      const text=await app.vault.read(file);
      const metadataDeadline=Date.now()+5000;
      while (!app.metadataCache.getFileCache(file)?.frontmatter) {
        if (Date.now()>metadataDeadline) throw new Error('Frontmatter not parsed by Obsidian');
        await new Promise(r=>setTimeout(r,100));
      }
      const frontmatter = app.metadataCache.getFileCache(file).frontmatter;
      const imagePaths=app.vault.getFiles().filter(f=>f.extension==='jpg').map(f=>f.path);
      return {text,frontmatter,note,imagePaths,vault:app.vault.adapter.getBasePath(),plugin:p.manifest.version,
        templater:app.plugins.plugins['templater-obsidian']?.manifest.version ?? null,
        desktop: ${JSON.stringify(process.env.E2E_DESKTOP === '1')}};
    } finally {p.searchGameMetadata=originalSearch;p.settings=originalSettings;}
  })()`);
  assert.ok(!result.text.includes('{{'), 'All named variables must resolve');
  const fm = result.frontmatter;
  assert.deepEqual(fm.Genre, fixture.game.genres);
  assert.deepEqual(fm.Platform, fixture.game.platforms);
  assert.equal(fm.Developer, fixture.game.developers[0]);
  assert.equal(fm.Publisher, fixture.game.publishers[0]);
  assert.match(fm.Cover, /^\[\[.*Resident Evil Requiem - after(?:-\d+)?\.jpg\]\]$/);
  assert.match(fm.Backdrop, /^\[\[.*screenshot-01(?:-\d+)?\.jpg\]\]$/);
  assert.equal(fm.StoreUrl, 'https://store.steampowered.com/app/3764200/Resident_Evil_Requiem/');
  assert.equal(fm.TimeToBeatMain, '');
  assert.equal(fm.TimeToBeatAverage, '');
  assert.equal(fm.TimeToBeatCompletionist, '');
  assert.equal(fm.SteamPlaytimeHours, '');
  assert.deepEqual(fm.SteamAchievements, []);
  const linkedImages = [fm.Cover, fm.Backdrop].map(s => s.slice(2,-2));
  for (const image of linkedImages) {
    assert.ok(result.imagePaths.includes(image), `Linked image ${image} exists in vault`);
    const bytes = await fs.readFile(path.join(result.vault, image));
    assert.ok(bytes.length > 1000, 'Real downloaded image has content');
    assert.equal(bytes.subarray(0,2).toString('hex'), 'ffd8', 'Downloaded image is JPEG');
  }
  await fs.mkdir(reportDir,{recursive:true});
  await fs.writeFile(path.join(reportDir,'after.md'),result.text);
  await fs.writeFile(path.join(reportDir,process.env.E2E_DESKTOP==='1'?'desktop.json':'headless.json'),JSON.stringify({...result, frontmatter:fm},null,2)+'\n');
  await page.screenshot(path.join(reportDir,process.env.E2E_DESKTOP==='1'?'desktop-after.png':'headless-after.png'));
  console.log(`PASS enrichment: YAML lists, first companies, local image wikilinks, real image downloads, Steam-only URL, no-key empty optional data (${result.vault})`);
} finally {page.close();}
