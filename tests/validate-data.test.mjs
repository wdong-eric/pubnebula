import { describe, expect, it } from 'vitest';
import { validatePeopleDocument } from '../scripts/validate-data.mjs';

describe('people.yaml validation', () => {
  it('requires OpenAlex IDs and evidence for approximate join order', () => {
    const errors = validatePeopleDocument({
      people: [
        {
          slug: 'bad-author',
          displayName: 'Bad Author',
          openAlexAuthorId: 'A123',
          orcid: null,
          roleLabel: 'Faculty member',
          joinOrder: {
            rank: 1,
            label: 'Approximate',
            confidence: 'low',
            evidenceNote: '',
            sourceUrl: 'not a url'
          }
        }
      ]
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('openAlexAuthorId'),
        expect.stringContaining('evidenceNote'),
        expect.stringContaining('sourceUrl')
      ])
    );
  });
});
