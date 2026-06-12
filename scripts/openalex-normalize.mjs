const OPENALEX_PREFIX = 'https://openalex.org/';

export function shortOpenAlexId(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return '';
  }

  const trimmed = value.trim();
  if (trimmed.startsWith(OPENALEX_PREFIX)) {
    return trimmed.slice(OPENALEX_PREFIX.length);
  }

  return trimmed;
}

export function normalizeTopic(topic) {
  if (!topic || typeof topic !== 'object') {
    return null;
  }

  return {
    id: topic.id ?? null,
    displayName: topic.display_name ?? 'Unclassified',
    score: Number.isFinite(topic.score) ? topic.score : null,
    subfield: topic.subfield?.display_name ?? null,
    field: topic.field?.display_name ?? null,
    domain: topic.domain?.display_name ?? null
  };
}

export function normalizeWork(rawWork) {
  if (!rawWork || typeof rawWork !== 'object') {
    throw new Error('OpenAlex work must be an object');
  }

  if (typeof rawWork.id !== 'string' || rawWork.id.length === 0) {
    throw new Error('OpenAlex work is missing id');
  }

  const primaryLocation = rawWork.primary_location ?? null;
  const source = primaryLocation?.source ?? null;
  const topics = Array.isArray(rawWork.topics)
    ? rawWork.topics.map(normalizeTopic).filter(Boolean)
    : [];

  return {
    id: rawWork.id,
    openAlexId: shortOpenAlexId(rawWork.id),
    doi: rawWork.doi ?? null,
    title: rawWork.display_name || 'Untitled work',
    publicationYear: Number.isInteger(rawWork.publication_year)
      ? rawWork.publication_year
      : null,
    citedByCount: Number.isFinite(rawWork.cited_by_count)
      ? rawWork.cited_by_count
      : 0,
    type: rawWork.type ?? null,
    landingPageUrl: primaryLocation?.landing_page_url ?? rawWork.doi ?? rawWork.id,
    sourceDisplayName: source?.display_name ?? primaryLocation?.raw_source_name ?? null,
    sourceType: source?.type ?? null,
    isOpenAccess: Boolean(primaryLocation?.is_oa),
    dominantTopic: topics[0] ?? null,
    topics
  };
}

export function normalizeAuthor(person) {
  return {
    slug: person.slug,
    displayName: person.displayName,
    openAlexAuthorId: person.openAlexAuthorId,
    openAlexAuthorShortId: shortOpenAlexId(person.openAlexAuthorId),
    orcid: person.orcid ?? null,
    roleLabel: person.roleLabel,
    stage: person.stage ?? null,
    joinOrder: person.joinOrder
  };
}

function findAuthorship(rawWork, person) {
  const authorId = shortOpenAlexId(person.openAlexAuthorId).toLowerCase();
  const orcid = typeof person.orcid === 'string' ? person.orcid.toLowerCase() : '';
  const authorships = Array.isArray(rawWork.authorships) ? rawWork.authorships : [];

  for (let index = 0; index < authorships.length; index += 1) {
    const authorship = authorships[index];
    const rawAuthorId = shortOpenAlexId(authorship?.author?.id).toLowerCase();
    const rawOrcid = String(authorship?.author?.orcid ?? authorship?.raw_orcid ?? '').toLowerCase();

    if (rawAuthorId === authorId || (orcid && rawOrcid === orcid)) {
      return { authorship, index };
    }
  }

  return { authorship: null, index: -1 };
}

export function normalizeNebula(people, rawWorksByAuthor, options = {}) {
  const worksById = new Map();
  const linksByKey = new Map();
  const warnings = [];

  for (const person of people) {
    const rawWorks = rawWorksByAuthor[person.slug] ?? [];

    for (const rawWork of rawWorks) {
      const normalizedWork = normalizeWork(rawWork);
      if (!worksById.has(normalizedWork.id)) {
        worksById.set(normalizedWork.id, normalizedWork);
      }

      const { authorship, index } = findAuthorship(rawWork, person);
      if (!authorship) {
        warnings.push(
          `${person.slug}: ${normalizedWork.openAlexId} did not expose a matching authorship`
        );
      }

      const linkKey = `${person.slug}::${normalizedWork.id}`;
      if (!linksByKey.has(linkKey)) {
        const coauthorCount = Array.isArray(rawWork.authorships)
          ? rawWork.authorships.length
          : null;

        linksByKey.set(linkKey, {
          authorSlug: person.slug,
          workId: normalizedWork.id,
          authorPosition: authorship?.author_position ?? 'unknown',
          authorIndex: index >= 0 ? index + 1 : null,
          coauthorCount,
          isCorresponding: Boolean(authorship?.is_corresponding),
          rawAuthorName: authorship?.raw_author_name ?? null
        });
      }
    }
  }

  const authors = people.map(normalizeAuthor);
  const works = Array.from(worksById.values()).sort((a, b) => {
    const yearDiff = (b.publicationYear ?? -Infinity) - (a.publicationYear ?? -Infinity);
    return yearDiff || a.title.localeCompare(b.title);
  });
  const authorWorkLinks = Array.from(linksByKey.values()).sort((a, b) => {
    return (
      a.authorSlug.localeCompare(b.authorSlug) ||
      String(a.workId).localeCompare(String(b.workId))
    );
  });

  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    publicationScope:
      options.publicationScope ??
      'Full-career OpenAlex works for current UoM astrophysics faculty.',
    rosterSourceUrl: options.rosterSourceUrl ?? 'https://astro.physics.unimelb.edu.au/',
    dataSource: {
      name: 'OpenAlex',
      url: 'https://openalex.org/',
      fetchedBy: 'scripts/fetch-openalex.mjs'
    },
    authors,
    works,
    authorWorkLinks,
    warnings
  };
}
