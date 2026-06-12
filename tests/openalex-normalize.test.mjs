import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  normalizeNebula,
  normalizeWork,
  shortOpenAlexId
} from '../scripts/openalex-normalize.mjs';

const fixture = JSON.parse(
  await readFile(new URL('./fixtures/openalex-sample.json', import.meta.url), 'utf8')
);

describe('OpenAlex normalization', () => {
  it('shortens full OpenAlex IDs without changing already-short IDs', () => {
    expect(shortOpenAlexId('https://openalex.org/A5071741314')).toBe('A5071741314');
    expect(shortOpenAlexId('A5071741314')).toBe('A5071741314');
    expect(shortOpenAlexId('')).toBe('');
  });

  it('keeps Unicode titles and tolerates missing metadata', () => {
    const withUnicode = normalizeWork(fixture.rawWorksByAuthor['alpha-author'][0]);
    const sparse = normalizeWork(fixture.rawWorksByAuthor['alpha-author'][1]);

    expect(withUnicode.title).toContain('neutron-star glitch');
    expect(withUnicode.dominantTopic.displayName).toBe(
      'Pulsars and Gravitational Waves Research'
    );
    expect(sparse.landingPageUrl).toBe('https://openalex.org/W101');
    expect(sparse.dominantTopic).toBeNull();
    expect(sparse.citedByCount).toBe(0);
  });

  it('deduplicates shared works while preserving author-work links', () => {
    const nebula = normalizeNebula(fixture.people, fixture.rawWorksByAuthor, {
      generatedAt: '2026-06-13T00:00:00.000Z'
    });

    expect(nebula.authors).toHaveLength(2);
    expect(nebula.works).toHaveLength(2);
    expect(nebula.authorWorkLinks).toHaveLength(3);
    expect(nebula.authorWorkLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          authorSlug: 'alpha-author',
          workId: 'https://openalex.org/W100',
          authorPosition: 'first',
          authorIndex: 1,
          coauthorCount: 2,
          isCorresponding: true
        }),
        expect.objectContaining({
          authorSlug: 'beta-author',
          workId: 'https://openalex.org/W100',
          authorPosition: 'middle',
          authorIndex: 2,
          coauthorCount: 2
        })
      ])
    );
  });
});
