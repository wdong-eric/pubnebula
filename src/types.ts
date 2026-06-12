export interface JoinOrder {
  rank: number;
  label: string;
  confidence: 'high' | 'medium' | 'low';
  evidenceNote: string;
  sourceUrl: string;
}

export interface NebulaAuthor {
  slug: string;
  displayName: string;
  openAlexAuthorId: string | null;
  openAlexAuthorShortId: string;
  orcid: string | null;
  roleLabel: string;
  stage: string | null;
  joinOrder: JoinOrder;
}

export interface NebulaTopic {
  id: string | null;
  displayName: string;
  score: number | null;
  subfield: string | null;
  field: string | null;
  domain: string | null;
}

export interface NebulaWork {
  id: string;
  openAlexId: string;
  doi: string | null;
  title: string;
  publicationYear: number | null;
  citedByCount: number;
  type: string | null;
  landingPageUrl: string;
  sourceDisplayName: string | null;
  sourceType: string | null;
  isOpenAccess: boolean;
  dominantTopic: NebulaTopic | null;
  topics: NebulaTopic[];
}

export interface AuthorWorkLink {
  authorSlug: string;
  workId: string;
  authorPosition: string;
  authorIndex: number | null;
  coauthorCount: number | null;
  isCorresponding: boolean;
  rawAuthorName: string | null;
}

export interface NebulaDataset {
  schemaVersion: number;
  generatedAt: string;
  publicationScope: string;
  rosterSourceUrl: string;
  dataSource: {
    name: string;
    url: string;
    fetchedBy: string;
  };
  authors: NebulaAuthor[];
  works: NebulaWork[];
  authorWorkLinks: AuthorWorkLink[];
  warnings: string[];
}
