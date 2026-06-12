import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parse } from 'yaml';

const PEOPLE_PATH = new URL('../data/people.yaml', import.meta.url);
const NEBULA_PATH = new URL('../public/data/nebula.json', import.meta.url);
const OPENALEX_AUTHOR_RE = /^https:\/\/openalex\.org\/A\d+$/;
const ORCID_RE = /^https:\/\/orcid\.org\/\d{4}-\d{4}-\d{4}-[\dX]{4}$/;
const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);

export function validatePeopleDocument(document) {
  const errors = [];
  const people = Array.isArray(document?.people) ? document.people : [];
  const slugs = new Set();
  const ranks = new Set();

  if (people.length === 0) {
    errors.push('people.yaml must contain at least one person');
  }

  for (const person of people) {
    const label = person?.slug ?? '<missing slug>';

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(person?.slug ?? '')) {
      errors.push(`${label}: slug must be kebab-case`);
    }
    if (slugs.has(person.slug)) {
      errors.push(`${label}: duplicate slug`);
    }
    slugs.add(person.slug);

    if (typeof person?.displayName !== 'string' || person.displayName.trim() === '') {
      errors.push(`${label}: displayName is required`);
    }
    if (
      person?.openAlexAuthorId !== null &&
      person?.openAlexAuthorId !== undefined &&
      !OPENALEX_AUTHOR_RE.test(person.openAlexAuthorId)
    ) {
      errors.push(`${label}: openAlexAuthorId must be a full https://openalex.org/A... URL or null`);
    }
    if (person?.orcid !== null && person?.orcid !== undefined && !ORCID_RE.test(person.orcid)) {
      errors.push(`${label}: orcid must be a full https://orcid.org/... URL or null`);
    }
    if (typeof person?.roleLabel !== 'string' || person.roleLabel.trim() === '') {
      errors.push(`${label}: roleLabel is required`);
    }

    const joinOrder = person?.joinOrder;
    if (!Number.isInteger(joinOrder?.rank) || joinOrder.rank < 1) {
      errors.push(`${label}: joinOrder.rank must be a positive integer`);
    } else if (ranks.has(joinOrder.rank)) {
      errors.push(`${label}: duplicate joinOrder.rank ${joinOrder.rank}`);
    } else {
      ranks.add(joinOrder.rank);
    }
    if (typeof joinOrder?.label !== 'string' || joinOrder.label.trim() === '') {
      errors.push(`${label}: joinOrder.label is required`);
    }
    if (!CONFIDENCE_VALUES.has(joinOrder?.confidence)) {
      errors.push(`${label}: joinOrder.confidence must be high, medium, or low`);
    }
    if (typeof joinOrder?.evidenceNote !== 'string' || joinOrder.evidenceNote.trim() === '') {
      errors.push(`${label}: joinOrder.evidenceNote is required for approximate ranks`);
    }
    if (typeof joinOrder?.sourceUrl !== 'string' || joinOrder.sourceUrl.trim() === '') {
      errors.push(`${label}: joinOrder.sourceUrl is required`);
    } else {
      try {
        new URL(joinOrder.sourceUrl);
      } catch {
        errors.push(`${label}: joinOrder.sourceUrl is not a valid URL`);
      }
    }
  }

  return errors;
}

export function validateNebulaDocument(document, peopleDocument) {
  const errors = [];
  const peopleSlugs = new Set((peopleDocument.people ?? []).map((person) => person.slug));
  const authorSlugs = new Set((document.authors ?? []).map((author) => author.slug));
  const workIds = new Set((document.works ?? []).map((work) => work.id));

  if (document?.schemaVersion !== 1) {
    errors.push('nebula.json: schemaVersion must be 1');
  }
  if (!Array.isArray(document?.authors) || document.authors.length === 0) {
    errors.push('nebula.json: authors must be a non-empty array');
  }
  if (!Array.isArray(document?.works)) {
    errors.push('nebula.json: works must be an array');
  }
  if (!Array.isArray(document?.authorWorkLinks)) {
    errors.push('nebula.json: authorWorkLinks must be an array');
  }

  for (const slug of peopleSlugs) {
    if (!authorSlugs.has(slug)) {
      errors.push(`nebula.json: missing author from people.yaml: ${slug}`);
    }
  }

  for (const link of document.authorWorkLinks ?? []) {
    if (!authorSlugs.has(link.authorSlug)) {
      errors.push(`nebula.json: link references unknown author ${link.authorSlug}`);
    }
    if (!workIds.has(link.workId)) {
      errors.push(`nebula.json: link references unknown work ${link.workId}`);
    }
  }

  return errors;
}

export async function loadPeopleDocument(path = PEOPLE_PATH) {
  return parse(await readFile(path, 'utf8'));
}

async function main() {
  const peopleDocument = await loadPeopleDocument();
  const errors = validatePeopleDocument(peopleDocument);

  if (existsSync(NEBULA_PATH)) {
    const nebulaDocument = JSON.parse(await readFile(NEBULA_PATH, 'utf8'));
    errors.push(...validateNebulaDocument(nebulaDocument, peopleDocument));
  } else {
    errors.push('public/data/nebula.json is missing; run npm run fetch:data first');
  }

  if (errors.length > 0) {
    console.error(errors.map((error) => `- ${error}`).join('\n'));
    process.exitCode = 1;
    return;
  }

  console.log(
    `Validated ${peopleDocument.people.length} people and ${
      existsSync(NEBULA_PATH) ? 'generated nebula data' : 'people data'
    }.`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
