import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';
import type {
  AuthorWorkLink,
  NebulaAuthor,
  NebulaDataset,
  NebulaTopic,
  NebulaWork
} from './types';

const TOPIC_COLORS = [
  '#5cc8ff',
  '#ffb24a',
  '#7ef0c1',
  '#ff6b88',
  '#b8e986',
  '#f7dd72',
  '#74a7ff',
  '#ff9f7a',
  '#8de3ff',
  '#d6f36a',
  '#a6b7ff',
  '#f28fd1'
];

interface PlanetObject {
  mesh: THREE.Mesh;
  author: NebulaAuthor;
  work: NebulaWork;
  link: AuthorWorkLink;
  searchText: string;
}

interface AuthorObject {
  mesh: THREE.Mesh;
  author: NebulaAuthor;
  label: HTMLDivElement;
  systemRadius: number;
  searchText: string;
}

type PickedObject =
  | { kind: 'author'; author: NebulaAuthor }
  | { kind: 'work'; author: NebulaAuthor; work: NebulaWork; link: AuthorWorkLink };

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root element');
}

app.innerHTML = `
  <main class="app-shell">
    <section class="scene-panel" aria-label="PubNebula visualization">
      <div class="topbar">
        <div>
          <p class="eyebrow">PubNebula</p>
          <h1>UoM Astrophysics Publication Galaxy</h1>
        </div>
        <p class="scope-note">
          Full-career OpenAlex works where IDs are curated, plus roster-only UoM astrophysics
          students. Radial star distance uses approximate proxy order, not appointment history.
        </p>
      </div>
      <div id="canvasHost" class="canvas-host"></div>
      <div id="labelLayer" class="label-layer" aria-hidden="true"></div>
      <div id="loadingState" class="loading-state">Loading generated nebula data...</div>
      <aside class="controls" aria-label="Galaxy controls">
        <label>
          Search
          <input id="searchInput" type="search" placeholder="Author, title, topic" />
        </label>
        <label>
          Focus
          <select id="authorSelect"></select>
        </label>
        <label>
          Topic
          <select id="topicSelect"></select>
        </label>
        <label>
          From year
          <input id="yearSlider" type="range" />
          <span id="yearLabel" class="control-value"></span>
        </label>
        <label class="toggle-row">
          <input id="labelsToggle" type="checkbox" checked />
          <span>Show labels</span>
        </label>
        <button id="resetButton" type="button">Reset camera</button>
        <p id="visibleCount" class="visible-count"></p>
      </aside>
      <aside id="detailsPanel" class="details-panel" aria-live="polite"></aside>
    </section>
  </main>
`;

const canvasHost = requireElement<HTMLDivElement>('#canvasHost');
const labelLayer = requireElement<HTMLDivElement>('#labelLayer');
const loadingState = requireElement<HTMLDivElement>('#loadingState');
const searchInput = requireElement<HTMLInputElement>('#searchInput');
const authorSelect = requireElement<HTMLSelectElement>('#authorSelect');
const topicSelect = requireElement<HTMLSelectElement>('#topicSelect');
const yearSlider = requireElement<HTMLInputElement>('#yearSlider');
const yearLabel = requireElement<HTMLSpanElement>('#yearLabel');
const labelsToggle = requireElement<HTMLInputElement>('#labelsToggle');
const resetButton = requireElement<HTMLButtonElement>('#resetButton');
const visibleCount = requireElement<HTMLParagraphElement>('#visibleCount');
const detailsPanel = requireElement<HTMLElement>('#detailsPanel');

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070d, 0.014);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 160);
const initialCameraPosition = new THREE.Vector3(0, 18, 33);
camera.position.copy(initialCameraPosition);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasHost.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 4;
controls.maxDistance = 72;
controls.target.set(0, 0, 0);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const topicMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
const authorObjects = new Map<string, AuthorObject>();
const planetObjects: PlanetObject[] = [];
const planetCountsByAuthor = new Map<string, number>();
const workById = new Map<string, NebulaWork>();
const pickables: THREE.Object3D[] = [];
const tmpVector = new THREE.Vector3();

let hovered: PickedObject | null = null;
let selected: PickedObject | null = null;
let dataset: NebulaDataset | null = null;
let minPublicationYear = 2000;
let maxPublicationYear = 2026;

const filterState = {
  search: '',
  authorSlug: 'all',
  topicId: 'all',
  fromYear: 2000,
  showLabels: true
};

loadNebula()
  .then((loadedDataset) => {
    dataset = loadedDataset;
    initializeScene(loadedDataset);
    loadingState.hidden = true;
  })
  .catch((error) => {
    loadingState.textContent = error instanceof Error ? error.message : String(error);
    loadingState.classList.add('is-error');
  });

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

async function loadNebula(): Promise<NebulaDataset> {
  const response = await fetch('/data/nebula.json');
  if (!response.ok) {
    throw new Error('Could not load public/data/nebula.json. Run npm run fetch:data first.');
  }
  return response.json();
}

function initializeScene(nebula: NebulaDataset) {
  for (const work of nebula.works) {
    workById.set(work.id, work);
  }

  const years = nebula.works
    .map((work) => work.publicationYear)
    .filter((year): year is number => Number.isInteger(year));
  minPublicationYear = Math.min(...years);
  maxPublicationYear = Math.max(...years);
  filterState.fromYear = minPublicationYear;

  addLighting();
  addBackgroundStars();
  addBlackHole();
  populateControls(nebula);
  addAuthorSystems(nebula);
  renderDetails();
  applyFilters();
  bindEvents();
  resize();
  animate();
}

function addLighting() {
  scene.add(new THREE.AmbientLight(0x99b6ff, 0.58));

  const coreLight = new THREE.PointLight(0xffc16b, 26, 36, 1.7);
  coreLight.position.set(0, 1.2, 0);
  scene.add(coreLight);

  const coolFill = new THREE.DirectionalLight(0x7fc9ff, 1.4);
  coolFill.position.set(-12, 16, 10);
  scene.add(coolFill);
}

function addBackgroundStars() {
  const vertices: number[] = [];
  const colors: number[] = [];

  for (let index = 0; index < 1400; index += 1) {
    const radius = 42 + seededUnit(`field-radius-${index}`) * 70;
    const theta = seededUnit(`field-theta-${index}`) * Math.PI * 2;
    const phi = Math.acos(seededUnit(`field-phi-${index}`) * 2 - 1);
    vertices.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );

    const tone = 0.62 + seededUnit(`field-tone-${index}`) * 0.38;
    colors.push(tone * 0.62, tone * 0.78, tone);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0.74,
    depthWrite: false
  });

  scene.add(new THREE.Points(geometry, material));
}

function addBlackHole() {
  const eventHorizon = new THREE.Mesh(
    new THREE.SphereGeometry(0.58, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  eventHorizon.userData = {
    selectable: {
      kind: 'author',
      author: null
    }
  };
  scene.add(eventHorizon);

  const disk = new THREE.Mesh(
    new THREE.TorusGeometry(0.92, 0.075, 12, 128),
    new THREE.MeshBasicMaterial({
      color: 0xffb14a,
      transparent: true,
      opacity: 0.92
    })
  );
  disk.rotation.x = Math.PI * 0.5;
  disk.rotation.z = -0.35;
  scene.add(disk);

  const outerDisk = new THREE.Mesh(
    new THREE.TorusGeometry(1.28, 0.038, 10, 128),
    new THREE.MeshBasicMaterial({
      color: 0x5cc8ff,
      transparent: true,
      opacity: 0.58
    })
  );
  outerDisk.rotation.x = Math.PI * 0.5;
  outerDisk.rotation.z = 0.28;
  scene.add(outerDisk);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.55, 48, 32),
    new THREE.MeshBasicMaterial({
      color: 0x2f8cff,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  scene.add(glow);
}

function populateControls(nebula: NebulaDataset) {
  authorSelect.replaceChildren(new Option('All roster stars', 'all'));
  for (const author of [...nebula.authors].sort((a, b) => a.joinOrder.rank - b.joinOrder.rank)) {
    authorSelect.add(new Option(author.displayName, author.slug));
  }

  const topicCounts = new Map<string, { topic: NebulaTopic; count: number }>();
  for (const work of nebula.works) {
    if (!work.dominantTopic?.id) {
      continue;
    }
    const item = topicCounts.get(work.dominantTopic.id) ?? {
      topic: work.dominantTopic,
      count: 0
    };
    item.count += 1;
    topicCounts.set(work.dominantTopic.id, item);
  }

  topicSelect.replaceChildren(new Option('All topics', 'all'));
  for (const { topic, count } of [...topicCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 18)) {
    topicSelect.add(new Option(`${topic.displayName} (${count})`, topic.id ?? ''));
  }

  yearSlider.min = String(minPublicationYear);
  yearSlider.max = String(maxPublicationYear);
  yearSlider.value = String(filterState.fromYear);
  yearLabel.textContent = `${filterState.fromYear} onward`;
}

function addAuthorSystems(nebula: NebulaDataset) {
  const authors = [...nebula.authors].sort((a, b) => a.joinOrder.rank - b.joinOrder.rank);
  const maxJoinRank = Math.max(...authors.map((author) => author.joinOrder.rank), 1);
  const linksByAuthor = new Map<string, AuthorWorkLink[]>();

  for (const link of nebula.authorWorkLinks) {
    const links = linksByAuthor.get(link.authorSlug) ?? [];
    links.push(link);
    linksByAuthor.set(link.authorSlug, links);
  }

  for (let index = 0; index < authors.length; index += 1) {
    const author = authors[index];
    const angle = (index / authors.length) * Math.PI * 2 + 0.32;
    const rankRatio =
      maxJoinRank === 1 ? 0 : (author.joinOrder.rank - 1) / (maxJoinRank - 1);
    const radius = 2.8 + rankRatio * 21;
    const position = new THREE.Vector3(
      Math.cos(angle) * radius,
      (seededUnit(`${author.slug}-height`) - 0.5) * 1.4,
      Math.sin(angle) * radius
    );

    const star = createAuthorStar(author, radius);
    star.position.copy(position);
    star.userData = {
      selectable: {
        kind: 'author',
        author
      } satisfies PickedObject
    };
    scene.add(star);
    pickables.push(star);

    const label = document.createElement('div');
    label.className = 'author-label';
    label.textContent = author.displayName;
    labelLayer.append(label);

    const authorObject = {
      mesh: star,
      author,
      label,
      systemRadius: radius,
      searchText: `${author.displayName} ${author.roleLabel}`.toLowerCase()
    };
    authorObjects.set(author.slug, authorObject);

    addJoinOrbit(radius);
    addPlanetsForAuthor(author, linksByAuthor.get(author.slug) ?? [], position);
  }
}

function createAuthorStar(author: NebulaAuthor, systemRadius: number) {
  const size = 0.24 + Math.min(0.2, author.joinOrder.rank * 0.018);
  const material = new THREE.MeshStandardMaterial({
    color: systemRadius < 10 ? 0xffcf70 : 0xdcecff,
    emissive: systemRadius < 10 ? 0xff9f3d : 0x5aa7ff,
    emissiveIntensity: 1.05,
    roughness: 0.38,
    metalness: 0.08
  });
  return new THREE.Mesh(new THREE.SphereGeometry(size, 32, 18), material);
}

function addJoinOrbit(radius: number) {
  const geometry = new THREE.RingGeometry(radius - 0.012, radius + 0.012, 160);
  const material = new THREE.MeshBasicMaterial({
    color: 0x315a8a,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const ring = new THREE.Mesh(geometry, material);
  ring.rotation.x = Math.PI * 0.5;
  scene.add(ring);
}

function addPlanetsForAuthor(
  author: NebulaAuthor,
  links: AuthorWorkLink[],
  authorPosition: THREE.Vector3
) {
  const workLinks = links
    .map((link) => ({ link, work: workById.get(link.workId) }))
    .filter((item): item is { link: AuthorWorkLink; work: NebulaWork } => Boolean(item.work))
    .sort((a, b) => {
      return (
        (a.work.publicationYear ?? 0) - (b.work.publicationYear ?? 0) ||
        a.work.title.localeCompare(b.work.title)
      );
    });

  const authorYears = workLinks
    .map(({ work }) => work.publicationYear)
    .filter((year): year is number => Number.isInteger(year));
  const minYear = Math.min(...authorYears);
  const maxYear = Math.max(...authorYears);
  const span = Math.max(1, maxYear - minYear);
  const localOuter = 0.55 + Math.min(2.2, Math.sqrt(workLinks.length) * 0.095);
  const planetGeometry = new THREE.SphereGeometry(1, 10, 8);

  for (let index = 0; index < workLinks.length; index += 1) {
    const { link, work } = workLinks[index];
    const year = work.publicationYear ?? minYear;
    const yearRatio = (year - minYear) / span;
    const localRadius = 0.38 + yearRatio * localOuter;
    const angle = index * 2.399963 + seededUnit(`${author.slug}-${work.id}`) * 0.45;
    const yOffset = (seededUnit(`${work.id}-${author.slug}-y`) - 0.5) * 0.34;
    const size = 0.038 + Math.min(0.13, Math.log10(work.citedByCount + 1) * 0.028);

    const planet = new THREE.Mesh(planetGeometry, materialForTopic(work.dominantTopic));
    planet.scale.setScalar(size);
    planet.position.set(
      authorPosition.x + Math.cos(angle) * localRadius,
      authorPosition.y + yOffset,
      authorPosition.z + Math.sin(angle) * localRadius
    );
    planet.userData = {
      selectable: {
        kind: 'work',
        author,
        work,
        link
      } satisfies PickedObject
    };
    scene.add(planet);
    pickables.push(planet);

    planetObjects.push({
      mesh: planet,
      author,
      work,
      link,
      searchText: [
        author.displayName,
        work.title,
        work.sourceDisplayName ?? '',
        work.dominantTopic?.displayName ?? '',
        work.dominantTopic?.subfield ?? ''
      ]
        .join(' ')
        .toLowerCase()
    });
  }

  planetCountsByAuthor.set(author.slug, workLinks.length);
}

function materialForTopic(topic: NebulaTopic | null) {
  const key = topic?.id ?? 'unclassified';
  const cached = topicMaterialCache.get(key);
  if (cached) {
    return cached;
  }

  const color = new THREE.Color(topic ? colorForKey(key) : '#9da8ba');
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.44),
    emissiveIntensity: 0.58,
    roughness: 0.72,
    metalness: 0.06
  });
  topicMaterialCache.set(key, material);
  return material;
}

function colorForKey(key: string) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return TOPIC_COLORS[hash % TOPIC_COLORS.length];
}

function seededUnit(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function bindEvents() {
  searchInput.addEventListener('input', () => {
    filterState.search = searchInput.value.trim().toLowerCase();
    applyFilters();
  });
  authorSelect.addEventListener('change', () => {
    filterState.authorSlug = authorSelect.value;
    focusSelectedAuthor();
    applyFilters();
  });
  topicSelect.addEventListener('change', () => {
    filterState.topicId = topicSelect.value;
    applyFilters();
  });
  yearSlider.addEventListener('input', () => {
    filterState.fromYear = Number(yearSlider.value);
    yearLabel.textContent = `${filterState.fromYear} onward`;
    applyFilters();
  });
  labelsToggle.addEventListener('change', () => {
    filterState.showLabels = labelsToggle.checked;
    updateLabels();
  });
  resetButton.addEventListener('click', resetCamera);
  renderer.domElement.addEventListener('pointermove', handlePointerMove);
  renderer.domElement.addEventListener('click', () => {
    selected = hovered;
    renderDetails(selected);
  });
  window.addEventListener('resize', resize);
}

function focusSelectedAuthor() {
  if (filterState.authorSlug === 'all') {
    return;
  }

  const authorObject = authorObjects.get(filterState.authorSlug);
  if (!authorObject) {
    return;
  }

  const target = authorObject.mesh.position;
  controls.target.copy(target);
  camera.position.copy(target).add(new THREE.Vector3(0, 3.1, 5.8));
}

function resetCamera() {
  filterState.authorSlug = 'all';
  authorSelect.value = 'all';
  controls.target.set(0, 0, 0);
  camera.position.copy(initialCameraPosition);
  selected = null;
  hovered = null;
  renderDetails();
  applyFilters();
}

function handlePointerMove(event: PointerEvent) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, false).find((item) => item.object.visible);
  hovered = (hit?.object.userData.selectable as PickedObject | undefined) ?? null;
  renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';

  if (!selected) {
    renderDetails(hovered);
  }
}

function applyFilters() {
  let visiblePlanets = 0;
  const visibleAuthors = new Set<string>();

  for (const planet of planetObjects) {
    const matchesAuthor =
      filterState.authorSlug === 'all' || planet.author.slug === filterState.authorSlug;
    const matchesTopic =
      filterState.topicId === 'all' || planet.work.dominantTopic?.id === filterState.topicId;
    const matchesYear =
      planet.work.publicationYear === null || planet.work.publicationYear >= filterState.fromYear;
    const matchesSearch =
      filterState.search === '' || planet.searchText.includes(filterState.search);

    const visible = matchesAuthor && matchesTopic && matchesYear && matchesSearch;
    planet.mesh.visible = visible;
    if (visible) {
      visiblePlanets += 1;
      visibleAuthors.add(planet.author.slug);
    }
  }

  for (const authorObject of authorObjects.values()) {
    const focused =
      filterState.authorSlug === 'all' || filterState.authorSlug === authorObject.author.slug;
    const authorMatchesSearch =
      filterState.search !== '' && authorObject.searchText.includes(filterState.search);
    const canShowRosterOnly =
      filterState.search === '' &&
      filterState.topicId === 'all' &&
      filterState.fromYear === minPublicationYear &&
      (planetCountsByAuthor.get(authorObject.author.slug) ?? 0) === 0;
    authorObject.mesh.visible =
      focused &&
      (visibleAuthors.has(authorObject.author.slug) || authorMatchesSearch || canShowRosterOnly);
  }

  visibleCount.textContent = `${visiblePlanets.toLocaleString()} planets visible of ${planetObjects.length.toLocaleString()}`;
  updateLabels();
}

function updateLabels() {
  for (const authorObject of authorObjects.values()) {
    const shouldShow =
      filterState.showLabels &&
      authorObject.mesh.visible &&
      (authorObject.author.roleLabel !== 'Student' || filterState.authorSlug === authorObject.author.slug) &&
      authorObject.systemRadius < 22;
    authorObject.label.hidden = !shouldShow;
    if (!shouldShow) {
      continue;
    }

    tmpVector.copy(authorObject.mesh.position).project(camera);
    const projectedX = (tmpVector.x * 0.5 + 0.5) * canvasHost.clientWidth;
    const projectedY = (-tmpVector.y * 0.5 + 0.5) * canvasHost.clientHeight;
    const labelWidth = authorObject.label.offsetWidth || 120;
    const labelHeight = authorObject.label.offsetHeight || 24;
    const x = Math.min(
      canvasHost.clientWidth - labelWidth / 2 - 8,
      Math.max(labelWidth / 2 + 8, projectedX)
    );
    const y = Math.min(
      canvasHost.clientHeight - labelHeight / 2 - 8,
      Math.max(labelHeight / 2 + 8, projectedY)
    );
    authorObject.label.style.left = `${x}px`;
    authorObject.label.style.top = `${y}px`;
  }
}

function renderDetails(item: PickedObject | null = null) {
  detailsPanel.replaceChildren();

  if (!item) {
    const title = document.createElement('h2');
    title.textContent = 'Galaxy Summary';
    const body = document.createElement('p');
    const authorCount = dataset?.authors.length ?? 0;
    const workCount = dataset?.works.length ?? 0;
    body.textContent = `${authorCount} roster stars, ${workCount.toLocaleString()} unique OpenAlex works, and planets repeated around each linked author.`;
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent =
      'Central object: UoM. Inner stellar rings: earlier curated/proxy order. Planet distance inside each system: publication year from OpenAlex metadata.';
    detailsPanel.append(title, body, note);
    return;
  }

  if (item.kind === 'author') {
    renderAuthorDetails(item.author);
  } else {
    renderWorkDetails(item.author, item.work, item.link);
  }
}

function renderAuthorDetails(author: NebulaAuthor) {
  const title = document.createElement('h2');
  title.textContent = author.displayName;
  const meta = document.createElement('p');
  const planetCount = planetCountsByAuthor.get(author.slug) ?? 0;
  meta.textContent = `${author.roleLabel}. ${planetCount.toLocaleString()} linked OpenAlex planets. Radial rank ${author.joinOrder.rank} (${author.joinOrder.confidence} confidence).`;
  const evidence = document.createElement('p');
  evidence.className = 'muted';
  evidence.textContent = author.joinOrder.evidenceNote;
  const source = document.createElement('a');
  source.href = author.joinOrder.sourceUrl;
  source.target = '_blank';
  source.rel = 'noreferrer';
  source.textContent = 'Join-order evidence';
  detailsPanel.append(title, meta, evidence, source);
}

function renderWorkDetails(
  author: NebulaAuthor,
  work: NebulaWork,
  link: AuthorWorkLink
) {
  const title = document.createElement('h2');
  title.textContent = work.title;
  const meta = document.createElement('p');
  meta.textContent = [
    author.displayName,
    work.publicationYear ?? 'Unknown year',
    `${work.citedByCount.toLocaleString()} citations`,
    link.authorPosition
  ].join(' | ');
  const topic = document.createElement('p');
  topic.className = 'muted';
  topic.textContent = work.dominantTopic
    ? `${work.dominantTopic.displayName} (${work.dominantTopic.subfield ?? 'no subfield'})`
    : 'No OpenAlex topic assigned';
  const source = document.createElement('p');
  source.className = 'muted';
  source.textContent = work.sourceDisplayName ?? 'No source metadata';
  const linkEl = document.createElement('a');
  linkEl.href = work.landingPageUrl;
  linkEl.target = '_blank';
  linkEl.rel = 'noreferrer';
  linkEl.textContent = 'Open work';
  detailsPanel.append(title, meta, topic, source, linkEl);
}

function resize() {
  const width = canvasHost.clientWidth;
  const height = canvasHost.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateLabels();
  renderer.render(scene, camera);
}
