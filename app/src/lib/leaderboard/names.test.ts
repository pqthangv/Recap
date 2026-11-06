import { readFileSync } from 'fs';
import { join } from 'path';

import { displayNameProblem, usernameProblem } from './names';

/** A file without its first comment lines (each copy says where it is). */
const body = (path: string) => readFileSync(path, 'utf8').replace(/^(\/\/.*\r?\n)+/, '');

describe('leaderboard names', () => {
  it("are checked exactly like the Worker's (sync/src/names.ts)", () => {
    const worker = join(__dirname, '..', '..', '..', '..', 'sync', 'src', 'names.ts');
    expect(body(join(__dirname, 'names.ts'))).toBe(body(worker));
  });

  it('say what is wrong', () => {
    expect(displayNameProblem('Thắng Phùng')).toBeNull();
    expect(displayNameProblem('Lan 🌸')).toBe('characters');
    expect(displayNameProblem('đm')).toBe('not_allowed');
    expect(usernameProblem('thang.p')).toBeNull();
    expect(usernameProblem('ab')).toBe('too_short');
    expect(usernameProblem('Thang')).toBe('characters'); // cleaned to lowercase before this
    expect(usernameProblem('recap')).toBe('not_allowed');
  });
});
