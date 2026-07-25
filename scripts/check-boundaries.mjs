import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repositoryRoot, "src");
const sourceExtensions = new Set([".ts", ".tsx"]);

const allowedDependencies = {
  app: new Set(["app", "features", "components", "domain", "store", "sync", "platform", "shared"]),
  features: new Set(["features", "components", "domain", "store", "sync", "platform", "shared"]),
  components: new Set(["components", "domain", "store", "platform", "shared"]),
  store: new Set(["store", "domain", "platform", "shared"]),
  sync: new Set(["sync", "domain", "platform", "shared"]),
  platform: new Set(["platform", "domain", "shared"]),
  domain: new Set(["domain", "shared"]),
  shared: new Set(["shared"]),
};

const forbiddenPackages = {
  features: ["@tauri-apps/"],
  components: ["@tauri-apps/"],
  store: ["react", "react-dom", "@tauri-apps/"],
  domain: ["react", "react-dom", "zustand", "@tauri-apps/"],
  shared: ["react", "react-dom", "zustand", "@tauri-apps/"],
};

function collectSourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(entryPath));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(entryPath);
  }
  return files;
}

function sourceLayer(file) {
  const relative = path.relative(sourceRoot, file).replaceAll("\\", "/");
  const firstSegment = relative.split("/")[0];
  return sourceExtensions.has(path.extname(firstSegment)) ? "app" : firstSegment;
}

function importedLayer(file, specifier) {
  if (!specifier.startsWith(".")) return null;
  const resolved = path.resolve(path.dirname(file), specifier);
  const relative = path.relative(sourceRoot, resolved).replaceAll("\\", "/");
  if (relative.startsWith("../")) return null;
  const firstSegment = relative.split("/")[0];
  return sourceExtensions.has(path.extname(firstSegment)) ? "app" : firstSegment;
}

function importSpecifiers(source) {
  const matches = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'();]+?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      matches.push({ specifier: match[1], index: match.index ?? 0 });
    }
  }
  return matches;
}

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function matchesPackage(specifier, prefix) {
  return specifier === prefix || specifier.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

const violations = [];
for (const file of collectSourceFiles(sourceRoot)) {
  const source = fs.readFileSync(file, "utf8");
  const fromLayer = sourceLayer(file);
  const allowed = allowedDependencies[fromLayer];
  if (!allowed) continue;

  const seen = new Set();
  for (const imported of importSpecifiers(source)) {
    const key = `${imported.specifier}:${imported.index}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const targetLayer = importedLayer(file, imported.specifier);
    if (targetLayer && allowedDependencies[targetLayer] && !allowed.has(targetLayer)) {
      violations.push({
        file,
        line: lineAt(source, imported.index),
        message: `${fromLayer} 不允许依赖 ${targetLayer}：${imported.specifier}`,
      });
    }

    for (const forbidden of forbiddenPackages[fromLayer] ?? []) {
      if (matchesPackage(imported.specifier, forbidden)) {
        violations.push({
          file,
          line: lineAt(source, imported.index),
          message: `${fromLayer} 不允许直接依赖 ${imported.specifier}`,
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error("模块边界检查失败：");
  for (const violation of violations) {
    const relative = path.relative(repositoryRoot, violation.file).replaceAll("\\", "/");
    console.error(`- ${relative}:${violation.line} ${violation.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("模块边界检查通过。");
}
