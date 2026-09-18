import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = ["index.html", "schools/index.html"];
const failures = [];

function checkLocalReference(page, reference) {
  if (/^(?:https?:|mailto:|#|data:)/.test(reference)) return;

  const cleanReference = reference.split(/[?#]/)[0];
  if (!cleanReference) return;

  const relativeTarget = cleanReference.startsWith("/")
    ? cleanReference.slice(1)
    : path.join(path.dirname(page), cleanReference);
  const target = relativeTarget.endsWith("/")
    ? path.join(relativeTarget, "index.html")
    : relativeTarget;

  if (!fs.existsSync(path.join(repositoryRoot, target))) {
    failures.push(`${page}: missing local target ${reference}`);
  }
}

for (const page of pages) {
  const source = fs.readFileSync(path.join(repositoryRoot, page), "utf8");
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, "");

  for (const match of withoutComments.matchAll(/\b(?:href|src|data-src|poster)="([^"]+)"/g)) {
    checkLocalReference(page, match[1]);
  }

  for (const match of withoutComments.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    checkLocalReference(page, match[1]);
  }
}

const home = fs.readFileSync(path.join(repositoryRoot, "index.html"), "utf8");
if (!home.includes('href="/schools/">Подать заявку</a>')) {
  failures.push("index.html: missing schools application CTA");
}
if (/Единая платформа|Единая точка входа в продукты THE БОТ\.|<header\b/.test(home)) {
  failures.push("index.html: removed root header or copy is present");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`PASS: local asset and route references in ${pages.length} HTML pages`);
