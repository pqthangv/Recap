import { DEFAULT_SETTINGS, DEVICE_SETTING_KEYS, parseSettings, SETTING_KEYS } from './settings';

const row = (key: string, value: unknown) => ({ key, value: JSON.stringify(value) });

describe('parseSettings', () => {
  it('uses the defaults when nothing is saved', () => {
    expect(parseSettings([])).toEqual(DEFAULT_SETTINGS);
    // Active recall by default (1.0.4): typing, read aloud and four grades.
    expect(DEFAULT_SETTINGS).toMatchObject({
      retention: 0.95,
      fourButtons: true,
      readAloud: true,
      typeAnswer: true,
    });
  });

  it('reads saved values', () => {
    const s = parseSettings([
      row(SETTING_KEYS.retention, 0.85),
      row(SETTING_KEYS.readAloud, false),
      row(SETTING_KEYS.typeAnswer, false),
      row(SETTING_KEYS.fourButtons, false),
      row(SETTING_KEYS.newPerDay, 35),
    ]);
    // Someone who turned these off keeps them off.
    expect(s).toMatchObject({
      retention: 0.85,
      readAloud: false,
      typeAnswer: false,
      fourButtons: false,
      newPerDay: 35,
    });
  });

  it('reads the language choice', () => {
    expect(parseSettings([]).language).toBe('auto');
    expect(parseSettings([row(SETTING_KEYS.language, 'vi')]).language).toBe('vi');
    expect(parseSettings([row(SETTING_KEYS.language, 'fr')]).language).toBe('auto');
  });

  it('reads the appearance choice (light, dark, or the phone’s)', () => {
    expect(parseSettings([]).appearance).toBe('auto');
    expect(parseSettings([row(SETTING_KEYS.appearance, 'dark')]).appearance).toBe('dark');
    expect(parseSettings([row(SETTING_KEYS.appearance, 'light')]).appearance).toBe('light');
    expect(parseSettings([row(SETTING_KEYS.appearance, 'blue')]).appearance).toBe('auto');
    expect(DEVICE_SETTING_KEYS).toContain(SETTING_KEYS.appearance); // per phone, not in backups
  });

  it('clamps or ignores bad values', () => {
    const s = parseSettings([
      row(SETTING_KEYS.retention, 0.99),
      row(SETTING_KEYS.newPerDay, -4),
      row(SETTING_KEYS.readAloud, 'yes'),
      row(SETTING_KEYS.typeAnswer, 1),
      { key: SETTING_KEYS.fourButtons, value: 'not json' },
    ]);
    expect(s.retention).toBe(0.95);
    expect(s.newPerDay).toBe(0);
    expect(s.readAloud).toBe(true);
    expect(s.typeAnswer).toBe(true);
    expect(s.fourButtons).toBe(true);
  });
});
