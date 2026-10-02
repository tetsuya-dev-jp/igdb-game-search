import fs from 'node:fs/promises';
import { connectVault } from './cdp.mjs';

const fixture = JSON.parse(await fs.readFile(new URL('./fixtures/resident-evil-requiem.json', import.meta.url), 'utf8'));
const template = `---
Title: "{{title}}"
Cover: "{{localCoverImage}}"
Backdrop: "{{localScreenshot}}"
Platform: "{{platforms}}"
Developer: "{{developer}}"
Publisher: "{{publisher}}"
Genre: "{{genres}}"
ReleaseDate: "{{firstReleaseDate}}"
Metacritic: "{{totalRatingCount}}"
StoreUrl: "{{websites}}"
---

# {{title}}
`;
const page = await connectVault();
try {
  const result = await page.evaluate(`(async () => {
    const p = app.plugins.plugins['igdb-game-search'];
    if (!p) throw new Error('Plugin not loaded');
    const game = ${JSON.stringify(fixture.game)};
    Object.assign(p.settings, {enableTranslation:false, useDefaultFrontmatter:false, templateFile:'',
      enableCoverImageSave:false, enableScreenshotSave:false, frontmatter:${JSON.stringify(template.split('---')[1].trim())},content:'# {{title}}'});
    game.localCoverImage = '00 - Atlas/Archive/Attachments/09 - The Arcade/Resident Evil Requiem.jpg';
    game.localScreenshots = ['00 - Atlas/Archive/Attachments/09 - The Arcade/Resident Evil Requiem/screenshot-01.jpg',
      '00 - Atlas/Archive/Attachments/09 - The Arcade/Resident Evil Requiem/screenshot-02.jpg'];
    game.localScreenshot = game.localScreenshots.join(', ');
    const text = await p.getRenderedContents(game);
    const note = 'Resident Evil Requiem - before.md';
    const existing = app.vault.getAbstractFileByPath(note);
    if (existing) await app.vault.modify(existing, text); else await app.vault.create(note, text);
    await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath(note), {state:{mode:'source'}});
    return {text, vault:app.vault.adapter.getBasePath(), obsidian:'1.13.7 (AppImage)', plugin:p.manifest.version};
  })()`);
  await fs.mkdir('docs/verification/issues-2-4', {recursive:true});
  await fs.writeFile('docs/verification/issues-2-4/before.md', result.text);
  await fs.writeFile('docs/verification/issues-2-4/baseline.json', JSON.stringify(result,null,2)+'\n');
  await page.screenshot('docs/verification/issues-2-4/before.png');
  console.log(JSON.stringify(result,null,2));
} finally { page.close(); }
