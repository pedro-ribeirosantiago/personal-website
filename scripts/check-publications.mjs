import { readFile, writeFile } from "node:fs/promises";

const PUBLICATIONS_FILE = new URL("../publications.html", import.meta.url);
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
const articles = await fetchScholarArticles();
const newArticles = articles
  .filter((article) => Number(article.year) >= SINCE_YEAR)
  .filter((article) => article.title)
  .filter((article) => !existingPublicationText.includes(normalizeText(article.title)))
  .sort(compareArticles);

if (newArticles.length === 0) {
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

await writeFile(PUBLICATIONS_FILE, nextHtml);
console.log(`Added ${newArticles.length} publication(s) for review.`);

async function fetchScholarArticles() {
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
  return Array.isArray(data.articles) ? data.articles : [];
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
