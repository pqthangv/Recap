import { DEFAULT_SETTINGS, parseSettings, SETTING_KEYS } from './settings';

const row = (key: string, value: unknown) => ({ key, value: JSON.stringify(value) });

describe('parseSettings', () => {
  it('uses the defaults when nothing is saved', () => {
    expect(parseSettings([])).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({
      retention: 0.95,
      fourButtons: false,
      readAloud: false,
    });
  });

  it('reads saved values', () => {
    const s = parseSettings([
      row(SETTING_KEYS.retention, 0.85),
      row(SETTING_KEYS.readAloud, true),
      row(SETTING_KEYS.newPerDay, 35),
    ]);
    expect(s).toMatchObject({ retention: 0.85, readAloud: true, newPerDay: 35 });
  });

  it('reads the language choice', () => {
    expect(parseSettings([]).language).toBe('auto');
    expect(parseSettings([row(SETTING_KEYS.language, 'vi')]).language).toBe('vi');
    expect(parseSettings([row(SETTING_KEYS.language, 'fr')]).language).toBe('auto');
  });

  it('clamps or ignores bad values', () => {
    const s = parseSettings([
      row(SETTING_KEYS.retention, 0.99),
      row(SETTING_KEYS.newPerDay, -4),
      row(SETTING_KEYS.readAloud, 'yes'),
      { key: SETTING_KEYS.fourButtons, value: 'not json' },
    ]);
    expect(s.retention).toBe(0.95);
    expect(s.newPerDay).toBe(0);
    expect(s.readAloud).toBe(false);
    expect(s.fourButtons).toBe(false);
  });
});
