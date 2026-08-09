import { applyTemplateTransformations } from './template';

describe('applyTemplateTransformations', () => {
  interface MomentApi {
    add(offset: number, unit: string): MomentApi;
    format(fmt: string): string;
  }
  interface MomentStub {
    (): MomentApi;
  }

  // window.moment is undefined in the jsdom test env (moment is not a dependency).
  // A frozen-clock moment stub is installed instead — the template.ts regex, offsets,
  // and formats run against real code. Frozen at 2026-01-15T12:00:00Z.
  let momentApi: MomentApi;

  beforeAll(() => {
    const moment = (() => {
      const d = new Date('2026-01-15T12:00:00Z');
      momentApi = {
        add: (offset: number, unit: string) => {
          if (unit === 'd') {
            d.setUTCDate(d.getUTCDate() + offset);
          }
          return momentApi;
        },
        format: (fmt: string) =>
          fmt
            .replace('YYYY', String(d.getUTCFullYear()))
            .replace('MM', String(d.getUTCMonth() + 1).padStart(2, '0'))
            .replace('DD', String(d.getUTCDate()).padStart(2, '0'))
            .replace('HH', String(d.getUTCHours()).padStart(2, '0'))
            .replace('mm', String(d.getUTCMinutes()).padStart(2, '0'))
            .replace('ss', String(d.getUTCSeconds()).padStart(2, '0')),
      };
      return momentApi;
    }) as unknown as MomentStub;
    (window as unknown as { moment?: MomentStub }).moment = moment;
  });

  afterAll(() => {
    delete (window as unknown as { moment?: MomentStub }).moment;
  });

  it('replaces {{date}} with the current date', () => {
    expect(applyTemplateTransformations('{{date}}')).toBe('2026-01-15');
  });

  it('replaces {{time}} with the current time', () => {
    expect(applyTemplateTransformations('{{time}}')).toBe('12:00:00');
  });

  it('applies day offsets to {{date±Nd}}', () => {
    expect(applyTemplateTransformations('{{date+1d}}')).toBe('2026-01-16');
    expect(applyTemplateTransformations('{{date-2d}}')).toBe('2026-01-13');
  });

  it('supports a custom format in {{date:format}} and {{time:format}}', () => {
    expect(applyTemplateTransformations('{{date:YYYY/MM/DD}}')).toBe('2026/01/15');
    expect(applyTemplateTransformations('{{time:HH:mm}}')).toBe('12:00');
  });

  it('matches tokens case-insensitively', () => {
    expect(applyTemplateTransformations('{{DATE}}')).toBe('2026-01-15');
  });

  it('leaves text without a token unchanged', () => {
    expect(applyTemplateTransformations('plain note text')).toBe('plain note text');
  });

  it('replaces multiple tokens in one string', () => {
    expect(applyTemplateTransformations('on {{date}} at {{time}}')).toBe('on 2026-01-15 at 12:00:00');
  });
});
