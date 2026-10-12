import {
  colorRank,
  decksInGroup,
  groupColor,
  groupCounts,
  groupDecks,
  groupOf,
  nameInGroup,
  sortDeckItems,
  sortDecks,
} from './deckGroups';

const deck = (name: string, id = name) => ({ id, name });

describe('deck groups', () => {
  it('groups decks that share a first name part, keeping the list order', () => {
    const items = groupDecks([
      deck('Geography'),
      deck('SAT'),
      deck('SAT Vocab Random'),
      deck('SAT › Archaic'),
      deck('SAT › Priority 1 › Week 2'),
      deck('World capitals'),
    ]);
    expect(
      items.map((i) => (i.kind === 'group' ? `[${i.name}: ${i.decks.length}]` : i.deck.name)),
    ).toEqual(['Geography', '[SAT: 3]', 'SAT Vocab Random', 'World capitals']);
  });

  it('keeps a lone sub-deck as a plain deck', () => {
    expect(groupDecks([deck('Languages › Spanish'), deck('Math')])).toEqual([
      { kind: 'deck', deck: deck('Languages › Spanish') },
      { kind: 'deck', deck: deck('Math') },
    ]);
  });

  it('matches group names ignoring case and spaces', () => {
    const decks = [deck('Bio › Cells'), deck('bio  › Plants'), deck('Biology')];
    expect(groupDecks(decks)[0]).toMatchObject({ kind: 'group', name: 'Bio' });
    expect(decksInGroup(decks, ' BIO ').map((d) => d.name)).toEqual([
      'Bio › Cells',
      'bio  › Plants',
    ]);
  });

  it('names decks inside their group', () => {
    expect(groupOf('SAT › Priority 1 › Week 2')).toBe('SAT');
    expect(nameInGroup('SAT › Priority 1 › Week 2')).toBe('Priority 1 › Week 2');
    expect(nameInGroup('SAT')).toBe('SAT');
  });

  it('adds up counts, keeping new cards within today’s allowance', () => {
    const byDeck = { a: { due: 3, new: 20 }, b: { due: 2, new: 20 }, c: { due: 0, new: 5 } };
    expect(groupCounts([deck('A', 'a'), deck('B', 'b')], byDeck, 20)).toEqual({ due: 5, new: 20 });
    expect(groupCounts([deck('C', 'c'), deck('D', 'd')], byDeck, 20)).toEqual({ due: 0, new: 5 });
  });
});

describe('sorting decks by color', () => {
  const PURPLE = '#5A31D6';
  const GREEN = '#0B8043';
  const RED = '#C5221F';
  const d = (name: string, color: string) => ({ id: name, name, color });

  it('orders decks and groups by palette color, keeping name order for equal colors', () => {
    const items = groupDecks([
      d('Art', RED),
      d('Biology', GREEN),
      d('Chemistry', PURPLE),
      d('SAT', GREEN),
      d('SAT › Archaic', RED),
      d('Zoology', PURPLE),
    ]);
    const names = (list: typeof items) =>
      list.map((i) => (i.kind === 'group' ? `[${i.name}]` : i.deck.name));
    expect(names(sortDeckItems(items, 'name'))).toEqual([
      'Art',
      'Biology',
      'Chemistry',
      '[SAT]',
      'Zoology',
    ]);
    // The SAT group takes the color of its "SAT" deck (green).
    expect(names(sortDeckItems(items, 'color'))).toEqual([
      'Chemistry',
      'Zoology',
      'Biology',
      '[SAT]',
      'Art',
    ]);
  });

  it('puts colors from outside the palette last', () => {
    expect(colorRank(PURPLE)).toBe(0);
    expect(colorRank('#5a31d6')).toBe(0);
    expect(colorRank('#123456')).toBeGreaterThan(colorRank(RED));
    expect(sortDecks([d('A', '#123456'), d('B', RED)], 'color').map((x) => x.name)).toEqual([
      'B',
      'A',
    ]);
  });

  it('uses the group-named deck for the group color', () => {
    expect(groupColor([d('SAT › A', RED), d('SAT', GREEN)])).toBe(GREEN);
    expect(groupColor([d('SAT › A', RED), d('SAT › B', GREEN)])).toBe(RED);
  });
});
