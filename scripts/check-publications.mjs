import { readFile, writeFile } from "node:fs/promises";

const PUBLICATIONS_FILE = new URL("../publications.html", import.meta.url);
const CITATION_SVG_FILE = new URL("../assets/citation-trend.svg", import.meta.url);
const AUTHOR_ID = process.env.GOOGLE_SCHOLAR_AUTHOR_ID || "TGJTQwYAAAAJ";
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const SINCE_YEAR = Number(process.env.PUBLICATION_YEAR || new Date().getFullYear());

const SECTION_ORDER = ["First Author", "Senior Author", "Other Collaborations"];

if (!SERPAPI_KEY) {
  console.log("SERPAPI_KEY is not set. Skipping publication check.");
  process.exit(0);
}

const html = await readFile(PUBLICATIONS_FILE, "utf8");
const existingPublicationText = normalizeText(stripHtml(html));
const scholarData = await fetchScholarData();
const articles = Array.isArray(scholarData.articles) ? scholarData.articles : [];
const citationSvgUpdated = await updateCitationSvg(scholarData);
const newArticles = articles
  .filter((article) => Number(article.year) >= SINCE_YEAR)
  .filter((article) => article.title)
  .filter((article) => !existingPublicationText.includes(normalizeText(article.title)))
  .sort(compareArticles);

if (newArticles.length === 0) {
  if (citationSvgUpdated) {
    console.log("Updated Google Scholar citation trend for review.");
  }

  console.log(`No new publications found from ${SINCE_YEAR}.`);
  process.exit(0);
}

const grouped = groupBySection(newArticles);
let nextHtml = html;

for (const sectionName of SECTION_ORDER) {
  const sectionArticles = grouped.get(sectionName) || [];

  if (sectionArticles.length === 0) {
    continue;
  }

  nextHtml = insertPublications(nextHtml, sectionName, sectionArticles);
}

if (nextHtml !== html) {
  await writeFile(PUBLICATIONS_FILE, nextHtml);
}

console.log(`Added ${newArticles.length} publication(s) for review.`);

async function fetchScholarData() {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_scholar_author");
  url.searchParams.set("author_id", AUTHOR_ID);
  url.searchParams.set("sort", "pubdate");
  url.searchParams.set("num", "100");
  url.searchParams.set("api_key", SERPAPI_KEY);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`SerpAPI request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

function groupBySection(articles) {
  const grouped = new Map(SECTION_ORDER.map((sectionName) => [sectionName, []]));

  for (const article of articles) {
    grouped.get(getPublicationSection(article)).push(article);
  }

  for (const sectionArticles of grouped.values()) {
    sectionArticles.sort(compareArticles);
  }

  return grouped;
}

function getPublicationSection(article) {
  const authors = parseAuthors(article.authors);

  if (authors.length === 0) {
    return "Other Collaborations";
  }

  if (isPedro(authors[0])) {
    return "First Author";
  }

  if (isPedro(authors[authors.length - 1])) {
    return "Senior Author";
  }

  return "Other Collaborations";
}

function parseAuthors(authors) {
  return String(authors || "")
    .split(/\s*,\s*/)
    .map((author) => author.trim())
    .filter(Boolean);
}

function isPedro(author) {
  return /santiago/i.test(author);
}

function compareArticles(a, b) {
  return (
    topicPriority(a) - topicPriority(b) ||
    Number(b.year || 0) - Number(a.year || 0) ||
    String(a.title || "").localeCompare(String(b.title || ""))
  );
}

function topicPriority(article) {
  const text = normalizeText(`${article.title || ""} ${article.publication || ""}`);
  const psychologyTerms = [
    "psycholog",
    "mental",
    "emotional",
    "wellbeing",
    "well being",
    "stress",
    "depression",
    "symptom",
    "social support",
    "bullying",
    "neuropsych",
    "parenting",
    "youth justice",
    "racism",
    "race related",
  ];
  const dentistryTerms = [
    "dental",
    "oral",
    "dentist",
    "caries",
    "decay",
    "xerostomia",
    "orthodont",
    "tooth",
    "teeth",
    "microbiome",
  ];

  if (psychologyTerms.some((term) => text.includes(term))) {
    return 0;
  }

  if (dentistryTerms.some((term) => text.includes(term))) {
    return 2;
  }

  return 1;
}

function insertPublications(sourceHtml, sectionName, articles) {
  const headingIndex = sourceHtml.indexOf(`>${sectionName} <svg`);

  if (headingIndex === -1) {
    throw new Error(`Could not find publication section: ${sectionName}`);
  }

  const listStart = sourceHtml.indexOf('<ol class="publication-list publication-group">', headingIndex);

  if (listStart === -1) {
    throw new Error(`Could not find publication list for section: ${sectionName}`);
  }

  const insertPosition = sourceHtml.indexOf("\n", listStart) + 1;
  const publicationItems = articles.map(formatPublicationItem).join("\n") + "\n";

  return sourceHtml.slice(0, insertPosition) + publicationItems + sourceHtml.slice(insertPosition);
}

function formatPublicationItem(article) {
  const year = Number(article.year) || SINCE_YEAR;
  const authors = formatAuthors(article.authors);
  const title = escapeHtml(article.title || "Title to review");
  const publication = article.publication
    ? ` <em>${escapeHtml(article.publication)}</em>.`
    : " <em>Publication details to review</em>.";

  return `          <li>${authors} (${year}). ${title}.${publication}</li>`;
}

function formatAuthors(authors) {
  const parsedAuthors = parseAuthors(authors);

  if (parsedAuthors.length === 0) {
    return "Santiago, P.H.R.";
  }

  return parsedAuthors
    .map((author) => (isPedro(author) ? "Santiago, P.H.R." : escapeHtml(author)))
    .join(", ");
}

function stripHtml(sourceHtml) {
  return sourceHtml.replace(/<[^>]*>/g, " ");
}

function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function updateCitationSvg(scholarData) {
  const graph = getCitationGraph(scholarData);

  if (graph.length === 0) {
    console.log("No Google Scholar citation graph found. Leaving citation chart unchanged.");
    return false;
  }

  const citationSvg = generateCitationSvg(graph);
  let currentSvg = "";

  try {
    currentSvg = await readFile(CITATION_SVG_FILE, "utf8");
  } catch {
    currentSvg = "";
  }

  if (currentSvg === citationSvg) {
    return false;
  }

  await writeFile(CITATION_SVG_FILE, citationSvg);
  return true;
}

function getCitationGraph(scholarData) {
  const possibleGraphs = [
    scholarData?.cited_by?.graph,
    scholarData?.cited_by?.cites_per_year,
    scholarData?.cited_by?.cites_per_year_graph,
  ];

  for (const graph of possibleGraphs) {
    if (Array.isArray(graph)) {
      return graph
        .map((point) => ({
          year: Number(point.year || point.name || point.label),
          citations: Number(point.citations || point.cites || point.value),
        }))
        .filter((point) => Number.isFinite(point.year) && Number.isFinite(point.citations));
    }
  }

  return [];
}

function generateCitationSvg(graph) {
  const points = graph.sort((a, b) => a.year - b.year);
  const width = 520;
  const height = 260;
  const chart = {
    left: 58,
    right: 20,
    top: 42,
    bottom: 54,
  };
  const chartWidth = width - chart.left - chart.right;
  const chartHeight = height - chart.top - chart.bottom;
  const maxCitations = Math.max(100, ...points.map((point) => point.citations));
  const yMax = Math.ceil(maxCitations / 100) * 100;
  const barGap = points.length > 8 ? 8 : 12;
  const barWidth = Math.max(12, (chartWidth - barGap * (points.length - 1)) / points.length);
  const yTicks = makeHundredTicks(yMax);
  const bars = points.map((point, index) => {
    const x = chart.left + index * (barWidth + barGap);
    const barHeight = (point.citations / yMax) * chartHeight;
    const y = chart.top + chartHeight - barHeight;

    return {
      ...point,
      x: round(x),
      y: round(y),
      width: round(barWidth),
      height: round(barHeight),
    };
  });
  const firstYear = bars[0]?.year || "";
  const lastYear = bars[bars.length - 1]?.year || "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="citation-title citation-desc">
  <title id="citation-title">Google Scholar citation trend</title>
  <desc id="citation-desc">Transparent sketch-style bar chart of yearly Google Scholar citations generated through SerpAPI.</desc>
  <defs>
    <pattern id="sketch-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-16)">
      <path d="M0 7.5L8 7.5" stroke="#1f2937" stroke-width="1" opacity=".22"/>
      <path d="M0 3.5L8 3.5" stroke="#1f2937" stroke-width=".75" opacity=".12"/>
    </pattern>
  </defs>
  <g fill="none" stroke="#1f2937" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${chart.left - 10} ${chart.top + chartHeight} C${chart.left + 80} ${chart.top + chartHeight + 3} ${chart.left + 242} ${chart.top + chartHeight - 2} ${chart.left + chartWidth + 8} ${chart.top + chartHeight}" stroke-width="1.35" opacity=".46"/>
    <path d="M${chart.left} ${chart.top - 6} C${chart.left - 2} ${chart.top + 42} ${chart.left - 2} ${chart.top + 104} ${chart.left} ${chart.top + chartHeight + 5}" stroke-width="1.35" opacity=".46"/>
${yTicks.map((tick) => {
  const y = round(chart.top + chartHeight - (tick / yMax) * chartHeight);
  return `    <path d="M${chart.left - 4} ${y} C${chart.left + 90} ${y - 1} ${chart.left + 260} ${y + 1} ${chart.left + chartWidth} ${y}" stroke-width=".8" opacity=".12"/>`;
}).join("\n")}
  </g>
  <g>
${bars.map((bar, index) => sketchBar(bar, index, chart.top + chartHeight)).join("\n")}
  </g>
  <g fill="#1f2937" font-family="Georgia, serif">
    <text x="270" y="24" font-size="16" text-anchor="middle" opacity=".58">Citations</text>
${yTicks.map((tick) => {
  const y = round(chart.top + chartHeight - (tick / yMax) * chartHeight + 4);
  const x = tick === 0 ? 28 : tick >= 1000 ? 7 : 16;
  return `    <text x="${x}" y="${y}" font-size="11" opacity=".64">${tick}</text>`;
}).join("\n")}
${bars.map((bar) => `    <text x="${round(bar.x + bar.width / 2)}" y="${Math.max(16, round(bar.y - 8))}" font-size="11" text-anchor="middle" opacity=".82">${bar.citations}</text>`).join("\n")}
${bars.map((bar) => `    <text x="${round(bar.x + bar.width / 2)}" y="${chart.top + chartHeight + 22}" font-size="11" text-anchor="middle" opacity=".72">${bar.year}</text>`).join("\n")}
  </g>
</svg>
`;
}

function makeHundredTicks(yMax) {
  const ticks = [];

  for (let tick = 0; tick <= yMax; tick += 100) {
    ticks.push(tick);
  }

  return ticks.length > 6 ? ticks.filter((_, index) => index % 2 === 0) : ticks;
}

function sketchBar(bar, index, baseline) {
  const jitter = sketchOffset(index, 0.8);
  const x = round(bar.x + jitter);
  const y = round(bar.y + sketchOffset(index + 2, 0.8));
  const width = round(bar.width + sketchOffset(index + 7, 0.5));
  const height = round(Math.max(1, baseline - y));

  return `    <path d="M${x} ${baseline} L${x} ${y + 1} C${x + width * 0.3} ${y - 1.4} ${x + width * 0.66} ${y + 1.2} ${x + width} ${y} L${x + width} ${baseline} Z" fill="url(#sketch-hatch)" stroke="#1f2937" stroke-width="1.6" opacity=".9"/>
    <path d="M${x + 2} ${baseline - height * 0.18} C${x + width * 0.45} ${baseline - height * 0.28} ${x + width * 0.48} ${baseline - height * 0.62} ${x + width - 2} ${y + 5}" fill="none" stroke="#1f2937" stroke-width=".8" opacity=".22"/>`;
}

function sketchOffset(seed, amount) {
  return round(Math.sin(seed * 12.9898) * amount);
}

function round(value) {
  return Math.round(value * 10) / 10;
}
