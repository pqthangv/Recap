import { studyButtonLabel } from '@/lib/format';

describe('studyButtonLabel', () => {
  it('shows the due count', () => {
    expect(studyButtonLabel(0)).toBe('Study · 0 due');
    expect(studyButtonLabel(12)).toBe('Study · 12 due');
  });
});
