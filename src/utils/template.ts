import { App, moment, normalizePath, Notice, TFile } from 'obsidian';
import { t } from '@utils/i18n';
import { GameEntry } from '@models/game.model';
import { renderGameVariables } from './template_values';

export async function getTemplateContents(app: App, templatePath: string | undefined): Promise<string> {
  const { metadataCache, vault } = app;
  const normalizedTemplatePath = normalizePath(templatePath ?? '');
  if (templatePath === '/') {
    return Promise.resolve('');
  }

  try {
    const templateFile = metadataCache.getFirstLinkpathDest(normalizedTemplatePath, '');
    return templateFile ? vault.cachedRead(templateFile) : '';
  } catch (err) {
    console.error(`Failed to read the template '${normalizedTemplatePath}'`, err);
    new Notice(t('notice.templateReadFailed'));
    return '';
  }
}

export function applyTemplateTransformations(rawTemplateContents: string, game?: object): string {
  const withDates = rawTemplateContents.replace(
    /{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi,
    (
      _substring,
      _timeOrDate: string,
      calc: string,
      timeDelta: string,
      unit: moment.unitOfTime.DurationConstructor,
      momentFormat: string,
    ) => {
      const currentDate = window.moment();
      if (calc) {
        currentDate.add(parseInt(timeDelta, 10), unit);
      }
      if (momentFormat) {
        return currentDate.format(momentFormat.substring(1).trim());
      }
      return _timeOrDate.toLowerCase() === 'time' ? currentDate.format('HH:mm:ss') : currentDate.format('YYYY-MM-DD');
    },
  );
  return game ? renderGameVariables(game as GameEntry, withDates) : withDates;
}

interface TemplaterPluginInstance {
  settings?: {
    trigger_on_file_creation?: boolean;
  };
  templater: {
    overwrite_file_commands(file: TFile): Promise<void>;
  };
}

function isTemplaterPluginInstance(value: unknown): value is TemplaterPluginInstance {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TemplaterPluginInstance>;
  return typeof candidate.templater?.overwrite_file_commands === 'function';
}

export async function useTemplaterPluginInFile(app: App, file: TFile): Promise<void> {
  const templaterPlugin = (
    app as App & {
      plugins?: {
        plugins?: Record<string, unknown>;
      };
    }
  ).plugins?.plugins?.['templater-obsidian'];

  if (!isTemplaterPluginInstance(templaterPlugin)) return;
  const legacyTrigger = templaterPlugin.settings?.trigger_on_file_creation;
  // Templater 2.25 moved security-sensitive flags to per-vault local storage.
  const localSettings: unknown =
    typeof legacyTrigger === 'boolean' ? undefined : app.loadLocalStorage?.('templater-local-settings');
  const modernTrigger =
    !!localSettings &&
    typeof localSettings === 'object' &&
    'trigger_on_file_creation' in localSettings &&
    localSettings.trigger_on_file_creation === true;
  if (!(legacyTrigger ?? modernTrigger)) {
    await templaterPlugin.templater.overwrite_file_commands(file);
  }
}
