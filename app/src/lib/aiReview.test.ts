import {
  addToNotes,
  cardsToSave,
  notesSourceAfter,
  setAllSelected,
  suggestDeckName,
  toReviewItems,
} from './aiReview';

describe('reviewing AI cards', () => {
  const items = toReviewItems([
    { front: 'Q1', back: 'A1' },
    { front: 'Q2', back: 'A2' },
  ]);

  it('starts with every card selected', () => {
    expect(items.every((i) => i.selected)).toBe(true);
    expect(cardsToSave(items)).toEqual([
      { front: 'Q1', back: 'A1', tags: [] },
      { front: 'Q2', back: 'A2', tags: [] },
    ]);
  });

  it('saves only selected cards with both sides filled in', () => {
    const edited = [
      { ...items[0], front: '  Edited  ' },
      { ...items[1], selected: false },
      { key: '2', front: 'No back', back: '  ', selected: true },
    ];
    expect(cardsToSave(edited)).toEqual([{ front: 'Edited', back: 'A1', tags: [] }]);
    expect(cardsToSave(setAllSelected(edited, false))).toEqual([]);
    expect(setAllSelected(edited, true).every((i) => i.selected)).toBe(true);
  });

  it('suggests a deck name from the source', () => {
    expect(suggestDeckName({ kind: 'topic', topic: '  The   French Revolution ' })).toBe(
      'The French Revolution',
    );
    expect(suggestDeckName({ kind: 'topic', topic: 'x'.repeat(80) })).toHaveLength(60);
    expect(suggestDeckName({ kind: 'pdf', fileName: 'Biology ch3.PDF' })).toBe('Biology ch3');
    expect(suggestDeckName({ kind: 'photo' })).toBe('Photo notes');
    expect(suggestDeckName({ kind: 'text' })).toBe('AI cards');
  });
});

describe('"Your notes"', () => {
  it('adds text from a photo or PDF below what is already there', () => {
    expect(addToNotes('', '  Page one.  ')).toBe('Page one.');
    expect(addToNotes('   \n', 'Page one.')).toBe('Page one.');
    expect(addToNotes('My notes.\n', ' Page two. ')).toBe('My notes.\n\nPage two.');
    expect(addToNotes('My notes.', '   ')).toBe('My notes.');
  });

  it('names the deck after the last PDF, else a photo, else plain text', () => {
    const text = { kind: 'text' } as const;
    const photo = { kind: 'photo' } as const;
    const pdf = (fileName: string) => ({ kind: 'pdf', fileName }) as const;
    expect(notesSourceAfter(text, photo)).toEqual(photo);
    expect(notesSourceAfter(photo, pdf('Biology.pdf'))).toEqual(pdf('Biology.pdf'));
    expect(notesSourceAfter(pdf('Biology.pdf'), photo)).toEqual(pdf('Biology.pdf'));
    expect(notesSourceAfter(pdf('Biology.pdf'), pdf('Chemistry.pdf'))).toEqual(
      pdf('Chemistry.pdf'),
    );
  });
});
