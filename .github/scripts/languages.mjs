// Builds the language-breakdown SVGs from the GitHub GraphQL API.
// Written by hand because lowlighter/metrics' languages plugin reports 0 languages
// for this account (and its repositories section reports 1 repo, when the same
// query returns 26). Run: GITHUB_TOKEN=... node .github/scripts/languages.mjs

const USER = process.env.METRICS_USER ?? "Kud0o";
const TOKEN = process.env.GITHUB_TOKEN;
const TOP = 8;
const WIDTH = 480;

if (!TOKEN) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

const query = `
{
  user(login: "${USER}") {
    repositories(first: 100, affiliations: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount
      nodes {
        languages(first: 20, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { authorization: `bearer ${TOKEN}`, "content-type": "application/json" },
  body: JSON.stringify({ query }),
});
if (!response.ok) {
  console.error(`GraphQL request failed: ${response.status} ${await response.text()}`);
  process.exit(1);
}
const payload = await response.json();
if (payload.errors) {
  console.error(`GraphQL errors: ${JSON.stringify(payload.errors)}`);
  process.exit(1);
}

const repositories = payload.data.user.repositories;
const bytes = new Map();
const colors = new Map();
for (const repository of repositories.nodes) {
  for (const { size, node } of repository.languages.edges) {
    bytes.set(node.name, (bytes.get(node.name) ?? 0) + size);
    colors.set(node.name, node.color ?? "#8b949e");
  }
}

const total = [...bytes.values()].reduce((sum, n) => sum + n, 0);
if (!total) {
  console.error("No language bytes returned — refusing to write an empty card");
  process.exit(1);
}

const ranked = [...bytes.entries()].sort((a, b) => b[1] - a[1]);
const shown = ranked.slice(0, TOP);
const otherBytes = ranked.slice(TOP).reduce((sum, [, n]) => sum + n, 0);
const slices = shown.map(([name, size]) => ({ name, size, color: colors.get(name) }));
if (otherBytes > 0) slices.push({ name: "Other", size: otherBytes, color: "#8b949e" });

const percent = (size) => (100 * size) / total;
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

console.log(`${repositories.totalCount} repositories, ${total.toLocaleString()} bytes`);
for (const slice of slices) {
  console.log(`  ${slice.name.padEnd(14)} ${percent(slice.size).toFixed(2).padStart(6)}%`);
}

function render({ text, muted, background, border }) {
  const pad = 16;
  const barW = WIDTH - pad * 2;
  const barY = 56;
  const barH = 8;

  let x = pad;
  const bar = slices.map((slice) => {
    const w = (barW * slice.size) / total;
    const rect = `<rect x="${x.toFixed(2)}" y="${barY}" width="${w.toFixed(2)}" height="${barH}" fill="${slice.color}"/>`;
    x += w;
    return rect;
  }).join("");

  const colW = barW / 2;
  const rowH = 20;
  const legendY = barY + barH + 24;
  const legend = slices.map((slice, i) => {
    const lx = pad + (i % 2) * colW;
    const ly = legendY + Math.floor(i / 2) * rowH;
    return `<circle cx="${lx + 5}" cy="${ly - 4}" r="4.5" fill="${slice.color}"/>` +
      `<text x="${lx + 17}" y="${ly}" fill="${text}" font-size="12">${escape(slice.name)}</text>` +
      `<text x="${lx + colW - 40}" y="${ly}" fill="${muted}" font-size="12">${percent(slice.size).toFixed(1)}%</text>`;
  }).join("");

  const rows = Math.ceil(slices.length / 2);
  const height = legendY + rows * rowH + 6;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif">
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="6" fill="${background}" stroke="${border}"/>
  <text x="${pad}" y="28" fill="${text}" font-size="14" font-weight="600">Most used languages</text>
  <text x="${pad}" y="45" fill="${muted}" font-size="11">across ${repositories.totalCount} public repositories</text>
  <clipPath id="round"><rect x="${pad}" y="${barY}" width="${barW}" height="${barH}" rx="4"/></clipPath>
  <g clip-path="url(#round)">${bar}</g>
  ${legend}
</svg>
`;
}

const { writeFileSync } = await import("node:fs");
writeFileSync("languages.light.svg", render({ text: "#1f2328", muted: "#59636e", background: "#ffffff", border: "#d1d9e0" }));
writeFileSync("languages.dark.svg", render({ text: "#e6edf3", muted: "#8b949e", background: "#0d1117", border: "#3d444d" }));
console.log("wrote languages.light.svg and languages.dark.svg");
