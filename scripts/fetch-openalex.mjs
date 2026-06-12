import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { normalizeNebula, shortOpenAlexId } from './openalex-normalize.mjs';

const PEOPLE_PATH = new URL('../data/people.yaml', import.meta.url);
const CACHE_DIR = new URL('../data/cache/openalex/', import.meta.url);
const OUTPUT_PATH = new URL('../public/data/nebula.json', import.meta.url);
const OPENALEX_WORKS_URL = 'https://api.openalex.org/works';
const SELECT_FIELDS = [
  'id',
  'doi',
  'display_name',
  'publication_year',
  'cited_by_count',
  'type',
  'authorships',
  'primary_location',
  'topics'
].join(',');

function readArgs(argv) {
  const options = {
    allowUnauthenticated: false,
    maxWorksPerAuthor: null
  };

  for (const arg of argv) {
    if (arg === '--allow-unauthenticated') {
      options.allowUnauthenticated = true;
    } else if (arg.startsWith('--max-works-per-author=')) {
      const value = Number(arg.split('=')[1]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error('--max-works-per-author must be a positive integer');
      }
      options.maxWorksPerAuthor = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenAlex request failed ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function buildUrl(person, cursor, apiKey) {
  const params = new URLSearchParams({
    filter: `authorships.author.id:${shortOpenAlexId(person.openAlexAuthorId)}`,
    sort: 'publication_year:desc',
    per_page: '100',
    cursor,
    select: SELECT_FIELDS
  });

  if (apiKey) {
    params.set('api_key', apiKey);
  }

  return `${OPENALEX_WORKS_URL}?${params.toString()}`;
}

async function fetchWorksForPerson(person, options) {
  const apiKey = process.env.OPENALEX_API_KEY ?? '';
  const rawWorks = [];
  const pages = [];
  let cursor = '*';

  if (!apiKey && !options.allowUnauthenticated) {
    throw new Error(
      'OPENALEX_API_KEY is not set. Use --allow-unauthenticated only for small local demos.'
    );
  }

  while (cursor) {
    const url = buildUrl(person, cursor, apiKey);
    const page = await fetchJson(url);
    const results = Array.isArray(page.results) ? page.results : [];
    pages.push({
      url,
      count: results.length,
      nextCursor: page.meta?.next_cursor ?? null
    });
    rawWorks.push(...results);

    if (
      options.maxWorksPerAuthor &&
      rawWorks.length >= options.maxWorksPerAuthor
    ) {
      return {
        works: rawWorks.slice(0, options.maxWorksPerAuthor),
        pages,
        truncated: true
      };
    }

    cursor = page.meta?.next_cursor ?? null;
    if (results.length === 0) {
      cursor = null;
    }
  }

  return { works: rawWorks, pages, truncated: false };
}

async function main() {
  const options = readArgs(process.argv.slice(2));
  const peopleDocument = parse(await readFile(PEOPLE_PATH, 'utf8'));
  const people = peopleDocument.people ?? [];

  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });

  const rawWorksByAuthor = {};
  const generatedAt = new Date().toISOString();

  for (const person of people) {
    console.log(`Fetching ${person.displayName} (${person.openAlexAuthorId})...`);
    const result = await fetchWorksForPerson(person, options);
    rawWorksByAuthor[person.slug] = result.works;
    await writeFile(
      new URL(`${person.slug}.json`, CACHE_DIR),
      `${JSON.stringify(
        {
          fetchedAt: generatedAt,
          author: {
            slug: person.slug,
            displayName: person.displayName,
            openAlexAuthorId: person.openAlexAuthorId
          },
          truncated: result.truncated,
          pages: result.pages,
          works: result.works
        },
        null,
        2
      )}\n`
    );
    console.log(`  ${result.works.length} works`);
  }

  const nebula = normalizeNebula(people, rawWorksByAuthor, {
    generatedAt,
    publicationScope: peopleDocument.dataset?.publicationScope,
    rosterSourceUrl: peopleDocument.dataset?.rosterSourceUrl
  });

  await writeFile(OUTPUT_PATH, `${JSON.stringify(nebula, null, 2)}\n`);
  console.log(
    `Wrote ${nebula.authors.length} authors, ${nebula.works.length} unique works, and ${nebula.authorWorkLinks.length} author-work links to public/data/nebula.json.`
  );
  if (nebula.warnings.length > 0) {
    console.warn(`Warnings: ${nebula.warnings.length}`);
  }
}

await main();
