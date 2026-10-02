import { describe, expect, it, jest } from '@jest/globals';
import { App, TFile } from 'obsidian';
import { useTemplaterPluginInFile } from './template';

function host(local: boolean, legacy?: boolean) {
  const overwrite = jest.fn<(file: TFile) => Promise<void>>().mockResolvedValue(undefined);
  const app = {
    plugins: {
      plugins: {
        'templater-obsidian': {
          settings: legacy === undefined ? { data_version: 2 } : { trigger_on_file_creation: legacy },
          templater: { overwrite_file_commands: overwrite },
        },
      },
    },
    loadLocalStorage: () => ({ trigger_on_file_creation: local }),
  } as unknown as App;
  return { app, overwrite };
}
describe('Templater version compatibility', () => {
  it('runs modern Templater once when local auto-trigger is off', async () => {
    const { app, overwrite } = host(false);
    await useTemplaterPluginInFile(app, new TFile());
    expect(overwrite).toHaveBeenCalledTimes(1);
  });
  it('does not double-execute modern Templater when local auto-trigger is on', async () => {
    const { app, overwrite } = host(true);
    await useTemplaterPluginInFile(app, new TFile());
    expect(overwrite).not.toHaveBeenCalled();
  });
  it('keeps legacy Templater trigger semantics', async () => {
    const manual = host(true, false);
    await useTemplaterPluginInFile(manual.app, new TFile());
    expect(manual.overwrite).toHaveBeenCalledTimes(1);
    const auto = host(false, true);
    await useTemplaterPluginInFile(auto.app, new TFile());
    expect(auto.overwrite).not.toHaveBeenCalled();
  });
});
