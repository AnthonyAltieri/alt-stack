import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "../../..");
const docsRoot = path.join(repoRoot, "apps/docs/docs");
const coveragePath = path.join(repoRoot, "apps/docs/api-coverage.json");
const coverage = JSON.parse(fs.readFileSync(coveragePath, "utf8"));
const problems = [];
const verificationResiduals = [];
const readmesToValidate = new Set();
const requireCommonJs = createRequire(import.meta.url);

function relative(file) {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

function readRequired(file) {
  if (!fs.existsSync(file)) {
    problems.push(`Missing file: ${relative(file)}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function docText(docPaths) {
  return docPaths
    .map((docPath) => readRequired(path.join(docsRoot, docPath)))
    .join("\n");
}

function hasInlineTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\\`${escaped}(?:\\\`|[<(])`).test(text);
}

function inlineTermMatcher(term) {
  return (text) => hasInlineTerm(text, term);
}

function inlineOwnerMatcher(owner) {
  const escapedOwner = owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:^|[^A-Za-z0-9_$])${escapedOwner}(?:[.#]|$|[^A-Za-z0-9_$])`,
  );
  return (text) =>
    [...text.matchAll(/`([^`]*)`/g)].some((code) => pattern.test(code[1]));
}

function inlineMemberMatcher(owner, member) {
  const escapedOwner = owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedMember = member.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tokenPattern = new RegExp(
    `(?:^|[^A-Za-z0-9_$])(?:${escapedOwner}[.#])?\\.?${escapedMember}(?:$|[^A-Za-z0-9_$])`,
  );
  const constructorPattern = new RegExp(
    `(?:^|[^A-Za-z0-9_$])new\\s+${escapedOwner}(?:$|[^A-Za-z0-9_$])`,
  );
  return (text) =>
    [...text.matchAll(/`([^`]*)`/g)].some(
      (code) =>
        tokenPattern.test(code[1]) ||
        (member === "constructor" && constructorPattern.test(code[1])),
    );
}

function maskMarkdownCode(markdown, { inline = true } = {}) {
  let fence;

  return markdown
    .split("\n")
    .map((line) => {
      const marker = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
      if (fence) {
        if (
          marker &&
          marker[1][0] === fence.character &&
          marker[1].length >= fence.length
        ) {
          fence = undefined;
        }
        return " ".repeat(line.length);
      }
      if (marker) {
        fence = { character: marker[1][0], length: marker[1].length };
        return " ".repeat(line.length);
      }
      if (!inline) return line;
      return line.replace(/`[^`\n]*`/g, (code) => " ".repeat(code.length));
    })
    .join("\n");
}

function visibleWords(markdown) {
  const visible = markdown
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[^A-Za-z0-9_-]+/g, " ")
    .trim();
  return visible.length === 0 ? [] : visible.split(/\s+/);
}

function isSubstantiveMarkdown(markdown) {
  const visible = maskMarkdownCode(markdown)
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[^A-Za-z0-9_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return visible.length >= 6 && visibleWords(visible).length >= 2;
}

function hasSubstantiveFencedCode(markdown) {
  return [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].some((match) => {
    const code = match[1].replace(/\s+/g, " ").trim();
    return code.length >= 16 && visibleWords(code).length >= 2;
  });
}

function headingSections(markdown) {
  const lines = markdown.split("\n");
  const sections = [];

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{1,6})\s+(.+)$/);
    if (!heading) continue;
    const level = heading[1].length;
    let end = index + 1;
    while (end < lines.length) {
      const nextHeading = lines[end].match(/^(#{1,6})\s+/);
      if (nextHeading && nextHeading[1].length <= level) break;
      end += 1;
    }
    sections.push({
      level,
      heading: heading[2],
      body: lines.slice(index + 1, end).join("\n"),
    });
  }

  return sections;
}

function namedSections(markdown, matchesName) {
  return headingSections(markdown)
    .filter((section) => matchesName(section.heading))
    .map((section) => section.body);
}

function codeContainsTerm(markdown, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const token = new RegExp(
    `(?:^|[^A-Za-z0-9_$])${escaped}(?:$|[^A-Za-z0-9_$])`,
  );
  const codePattern = /```[^\n]*\n([\s\S]*?)```|`([^`\n]+)`/g;
  return [...markdown.matchAll(codePattern)].some((match) =>
    token.test(match[1] ?? match[2]),
  );
}

function codeContainsConstructor(markdown, owner) {
  const escapedOwner = owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const constructor = new RegExp(
    `(?:\\bconstructor\\s*\\(|\\bnew\\s+${escapedOwner}(?:<[^>]+>)?\\s*\\()`,
  );
  const codePattern = /```[^\n]*\n([\s\S]*?)```|`([^`\n]+)`/g;
  return [...markdown.matchAll(codePattern)].some((match) =>
    constructor.test(match[1] ?? match[2]),
  );
}

function fencedCodeContainsTerm(markdown, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const token = new RegExp(
    `(?:^|[^A-Za-z0-9_$])${escaped}(?:$|[^A-Za-z0-9_$])`,
  );
  return [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].some((match) =>
    token.test(match[1]),
  );
}

function isExportInventoryHeading(heading) {
  return /^(?:complete )?(?:export|re-export)(?:s| list| checklist)?$/i.test(
    heading.replace(/`/g, "").trim(),
  );
}

function specificContainingSections(markdown, matchesName) {
  const candidates = headingSections(markdown).filter(
    (section) =>
      !isExportInventoryHeading(section.heading) && matchesName(section.body),
  );
  const deepestLevel = Math.max(0, ...candidates.map((section) => section.level));
  return candidates
    .filter((section) => section.level === deepestLevel)
    .map((section) => section.body);
}

function splitMarkdownTableRow(line) {
  const cells = [];
  let cell = "";
  let escaped = false;

  for (const character of line.trim()) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === "\\") {
      cell += character;
      escaped = true;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  if (cells[0] === "") cells.shift();
  if (cells.at(-1) === "") cells.pop();
  return cells;
}

function descriptiveEntryLines(markdown, matchesName) {
  const entries = [];

  for (const line of maskMarkdownCode(markdown, { inline: false }).split(
    "\n",
  )) {
    if (!matchesName(line)) continue;

    if (/^\s*\|/.test(line)) {
      const cells = splitMarkdownTableRow(line);
      for (let index = 0; index < cells.length; index += 1) {
        if (!matchesName(cells[index])) continue;
        const description = cells.slice(index + 1).join(" ");
        const words = visibleWords(description);
        if (description.replace(/[`\s|]/g, "").length >= 4 && words.length > 0) {
          entries.push(line);
          break;
        }
      }
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const content = line.replace(/^\s*[-*+]\s+/, "");
      const narrative = content.replace(/`[^`]*`/g, " ");
      const colon = content.indexOf(":");
      const afterColon = colon >= 0 ? content.slice(colon + 1) : "";
      if (
        visibleWords(narrative).length >= 2 ||
        (colon >= 0 && visibleWords(afterColon).length > 0)
      ) {
        entries.push(line);
      }
    }
  }

  return entries;
}

function descriptiveProseLines(markdown, matchesName) {
  const lines = [];

  for (const line of maskMarkdownCode(markdown, { inline: false }).split(
    "\n",
  )) {
    if (
      !matchesName(line) ||
      /^\s*(?:#{1,6}\s+|[-*+]\s+|\|)/.test(line)
    ) {
      continue;
    }
    const narrative = line.replace(/`[^`]*`/g, " ");
    const words = visibleWords(narrative);
    const inventoryOnly =
      /\b(?:exports?|exported (?:types|values|classes))\b/i.test(narrative) &&
      words.length <= 8;
    if (words.length >= 3 && !inventoryOnly) lines.push(line);
  }

  return lines;
}

function hasDescriptiveCoverage(markdown, matchesName, codeName) {
  if (
    namedSections(markdown, matchesName).some((section) =>
      isSubstantiveMarkdown(section) || hasSubstantiveFencedCode(section),
    )
  ) {
    return true;
  }
  if (
    codeName &&
    headingSections(markdown).some(
      (section) =>
        section.level >= 2 &&
        !isExportInventoryHeading(section.heading) &&
        isSubstantiveMarkdown(section.body) &&
        fencedCodeContainsTerm(section.body, codeName),
    )
  ) {
    return true;
  }
  if (
    mentionContexts(markdown, matchesName).some(
      (context) =>
        context.includes("\n") &&
        (isSubstantiveMarkdown(context) || hasSubstantiveFencedCode(context)),
    )
  ) {
    return true;
  }
  return (
    descriptiveEntryLines(markdown, matchesName).length > 0 ||
    descriptiveProseLines(markdown, matchesName).length > 0
  );
}

function mentionContexts(markdown, matchesName) {
  const originalLines = markdown.split("\n");
  const searchableLines = maskMarkdownCode(markdown, { inline: false }).split(
    "\n",
  );
  const contexts = [];

  for (let index = 0; index < searchableLines.length; index += 1) {
    const line = searchableLines[index];
    if (!matchesName(line)) continue;
    if (/^\s*(?:[-*+]\s+|\|)/.test(line)) {
      contexts.push(originalLines[index]);
      continue;
    }

    let cursor = index + 1;
    while (cursor < searchableLines.length && searchableLines[cursor].trim() === "") {
      cursor += 1;
    }
    if (cursor < searchableLines.length && /^\s*\|/.test(searchableLines[cursor])) {
      while (cursor < searchableLines.length && /^\s*\|/.test(searchableLines[cursor])) {
        cursor += 1;
      }
      contexts.push(originalLines.slice(index, cursor).join("\n"));
    } else {
      contexts.push(originalLines[index]);
    }
  }

  return contexts;
}

function hasDescriptiveMemberCoverage(markdown, owner, member) {
  const ownerMatcher = inlineOwnerMatcher(owner);
  const memberMatcher = inlineMemberMatcher(owner, member);
  const escapedMember = member.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const plainMember = new RegExp(
    `(?:^|[^A-Za-z0-9_$])${escapedMember}(?:$|[^A-Za-z0-9_$])`,
  );
  const ownerSections = [
    ...namedSections(markdown, ownerMatcher),
    ...mentionContexts(markdown, ownerMatcher),
    ...specificContainingSections(markdown, ownerMatcher),
  ];

  for (const section of ownerSections) {
    if (
      (isSubstantiveMarkdown(section) || hasSubstantiveFencedCode(section)) &&
      (codeContainsTerm(section, member) ||
        (member === "constructor" && codeContainsConstructor(section, owner)))
    ) {
      return true;
    }
    if (hasDescriptiveCoverage(section, memberMatcher)) return true;

    if (descriptiveProseLines(section, memberMatcher).length > 0) return true;
    if (
      descriptiveProseLines(section, ownerMatcher).some((line) =>
        plainMember.test(line.replace(/`/g, "")),
      )
    ) {
      return true;
    }
  }

  return descriptiveEntryLines(markdown, ownerMatcher).some(
    (entry) => memberMatcher(entry) || plainMember.test(entry.replace(/`/g, "")),
  );
}

function hasModifier(node, kind) {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
    : false;
}

function publicMemberName(name) {
  if (!name || ts.isPrivateIdentifier(name)) return undefined;
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  if (
    ts.isComputedPropertyName(name) &&
    (ts.isStringLiteral(name.expression) ||
      ts.isNumericLiteral(name.expression))
  ) {
    return name.expression.text;
  }
  return undefined;
}

function collectNamedTypeMembers(members, qualifiedName, result) {
  for (const member of members) {
    if (
      hasModifier(member, ts.SyntaxKind.PrivateKeyword) ||
      hasModifier(member, ts.SyntaxKind.ProtectedKeyword)
    ) {
      continue;
    }

    if (ts.isConstructorDeclaration(member)) {
      result.members.add("constructor");
      for (const parameter of member.parameters) {
        const isParameterProperty =
          hasModifier(parameter, ts.SyntaxKind.PublicKeyword) ||
          hasModifier(parameter, ts.SyntaxKind.PrivateKeyword) ||
          hasModifier(parameter, ts.SyntaxKind.ProtectedKeyword) ||
          hasModifier(parameter, ts.SyntaxKind.ReadonlyKeyword);
        if (
          !isParameterProperty ||
          hasModifier(parameter, ts.SyntaxKind.PrivateKeyword) ||
          hasModifier(parameter, ts.SyntaxKind.ProtectedKeyword)
        ) {
          continue;
        }
        const name = publicMemberName(parameter.name);
        if (name) result.members.add(name);
      }
      continue;
    }

    if (
      ts.isCallSignatureDeclaration(member) ||
      ts.isConstructSignatureDeclaration(member) ||
      ts.isIndexSignatureDeclaration(member)
    ) {
      result.residuals.add(
        `${qualifiedName}: unnamed public ${ts.SyntaxKind[member.kind]} cannot be mapped to a documentation term`,
      );
      continue;
    }

    if (
      ts.isPropertyDeclaration(member) ||
      ts.isPropertySignature(member) ||
      ts.isMethodDeclaration(member) ||
      ts.isMethodSignature(member) ||
      ts.isGetAccessorDeclaration(member) ||
      ts.isSetAccessorDeclaration(member)
    ) {
      const name = publicMemberName(member.name);
      if (name) {
        result.members.add(name);
      } else {
        result.residuals.add(
          `${qualifiedName}: a computed public member name cannot be derived reliably`,
        );
      }
    }
  }
}

function isInside(directory, file) {
  const fromDirectory = path.relative(directory, file);
  return (
    fromDirectory === "" ||
    (!fromDirectory.startsWith(`..${path.sep}`) && fromDirectory !== "..")
  );
}

function declaredPublicMembers(symbol, packageName, packageDirectory) {
  const target =
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const result = { members: new Set(), residuals: new Set() };
  const declarations = target.declarations ?? [];
  const ownedDeclarations = declarations.filter((declaration) =>
    isInside(packageDirectory, declaration.getSourceFile().fileName),
  );

  for (const declaration of ownedDeclarations) {
    const qualifiedName = `${packageName}.${symbol.getName()}`;
    if (ts.isClassDeclaration(declaration)) {
      collectNamedTypeMembers(declaration.members, qualifiedName, result);
    } else if (ts.isInterfaceDeclaration(declaration)) {
      collectNamedTypeMembers(declaration.members, qualifiedName, result);
    } else if (
      ts.isTypeAliasDeclaration(declaration) &&
      ts.isTypeLiteralNode(declaration.type)
    ) {
      collectNamedTypeMembers(declaration.type.members, qualifiedName, result);
    }
  }

  if (ownedDeclarations.length === 0) {
    const externalTypedDeclaration = declarations.find(
      (declaration) =>
        ts.isClassDeclaration(declaration) ||
        ts.isInterfaceDeclaration(declaration) ||
        (ts.isTypeAliasDeclaration(declaration) &&
          ts.isTypeLiteralNode(declaration.type)),
    );
    if (
      externalTypedDeclaration &&
      ![...publicTypescriptPackages.values()].some((directory) =>
        isInside(directory, externalTypedDeclaration.getSourceFile().fileName),
      )
    ) {
      result.residuals.add(
        `${packageName}.${symbol.getName()}: member coverage is not asserted for external declaration ${relative(externalTypedDeclaration.getSourceFile().fileName)}`,
      );
    }
  }

  return result;
}

function markdownLinkDestinations(markdown) {
  const searchable = maskMarkdownCode(markdown);
  const links = [];
  const inlinePattern =
    /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|((?:\\.|[^)\s])+))/g;
  for (const match of searchable.matchAll(inlinePattern)) {
    links.push({ destination: match[1] ?? match[2], index: match.index });
  }

  const referencePattern =
    /^[ \t]{0,3}\[([^\]\n]+)\]:[ \t]*(?:<([^>\n]+)>|((?:\\.|[^\s])+))/gm;
  for (const match of searchable.matchAll(referencePattern)) {
    if (match[1].startsWith("^")) continue;
    links.push({ destination: match[2] ?? match[3], index: match.index });
  }
  return links;
}

function verifyLocalMarkdownLinks(readmePath) {
  if (!fs.existsSync(readmePath)) return;
  const markdown = fs.readFileSync(readmePath, "utf8");

  for (const { destination, index } of markdownLinkDestinations(markdown)) {
    if (
      destination.startsWith("#") ||
      destination.startsWith("/") ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination)
    ) {
      continue;
    }

    const pathPart = destination.split(/[?#]/, 1)[0];
    if (pathPart.length === 0) continue;

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathPart).replace(/\\(.)/g, "$1");
    } catch {
      const line = markdown.slice(0, index).split("\n").length;
      problems.push(
        `${relative(readmePath)}:${line} has invalid URL encoding in local Markdown link: ${destination}`,
      );
      continue;
    }

    const targetPath = path.resolve(path.dirname(readmePath), decodedPath);
    const targetRelative = path.relative(repoRoot, targetPath);
    const line = markdown.slice(0, index).split("\n").length;
    if (
      targetRelative === ".." ||
      targetRelative.startsWith(`..${path.sep}`)
    ) {
      problems.push(
        `${relative(readmePath)}:${line} local Markdown link escapes the repository: ${destination}`,
      );
    } else if (!fs.existsSync(targetPath)) {
      problems.push(
        `${relative(readmePath)}:${line} has a broken local Markdown link: ${destination} (resolved to ${relative(targetPath)})`,
      );
    }
  }
}

function walkMarkdown(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkMarkdown(entryPath);
    return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
  });
}

function collectSidebarDocIds(sidebars) {
  const docIds = [];

  function visit(item, location) {
    if (typeof item === "string") {
      docIds.push(item);
      return;
    }
    if (!item || typeof item !== "object") return;

    if (item.type === "doc") {
      if (typeof item.id === "string") {
        docIds.push(item.id);
      } else {
        problems.push(`${location} contains a doc item without a string id`);
      }
      return;
    }

    if (item.type === "category" && Array.isArray(item.items)) {
      item.items.forEach((child, index) =>
        visit(child, `${location}.items[${index}]`),
      );
    }
  }

  if (!sidebars || typeof sidebars !== "object") {
    problems.push("apps/docs/sidebars.js must export a sidebar object");
    return docIds;
  }

  for (const [sidebarName, items] of Object.entries(sidebars)) {
    if (!Array.isArray(items)) {
      problems.push(
        `apps/docs/sidebars.js export ${sidebarName} must be an array`,
      );
      continue;
    }
    items.forEach((item, index) =>
      visit(item, `apps/docs/sidebars.js:${sidebarName}[${index}]`),
    );
  }

  return docIds;
}

function verifySidebarCoverage(allowedDocPaths) {
  const sidebarPath = path.join(repoRoot, "apps/docs/sidebars.js");
  if (!fs.existsSync(sidebarPath)) {
    problems.push("Missing file: apps/docs/sidebars.js");
    return;
  }

  let sidebars;
  try {
    sidebars = requireCommonJs(sidebarPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    problems.push(`Could not evaluate apps/docs/sidebars.js: ${message}`);
    return;
  }

  const expectedIds = new Set(
    [...allowedDocPaths].map((docPath) => docPath.replace(/\.md$/, "")),
  );
  const sidebarIds = collectSidebarDocIds(sidebars);
  const sidebarIdCounts = new Map();
  for (const sidebarId of sidebarIds) {
    sidebarIdCounts.set(sidebarId, (sidebarIdCounts.get(sidebarId) ?? 0) + 1);
  }

  for (const expectedId of expectedIds) {
    if (!sidebarIdCounts.has(expectedId)) {
      problems.push(
        `Canonical documentation page is missing from apps/docs/sidebars.js: ${expectedId}`,
      );
    }
  }
  for (const [sidebarId, count] of sidebarIdCounts) {
    if (!expectedIds.has(sidebarId)) {
      problems.push(
        `apps/docs/sidebars.js references a non-canonical documentation page: ${sidebarId}`,
      );
    }
    if (count > 1) {
      problems.push(
        `apps/docs/sidebars.js references the documentation page ${sidebarId} ${count} times`,
      );
    }
  }
}

function rustPublicSymbols(source) {
  const symbols = new Set();
  const declarationPattern =
    /^pub\s+(?:async\s+)?(?:const|enum|fn|mod|static|struct|trait|type|union)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  for (const match of source.matchAll(declarationPattern)) {
    symbols.add(match[1]);
  }

  const publicUsePattern = /^pub\s+use\s+([\s\S]*?);/gm;
  for (const match of source.matchAll(publicUsePattern)) {
    const useExpression = match[1];
    const openingBrace = useExpression.indexOf("{");
    const closingBrace = useExpression.lastIndexOf("}");
    const bindings =
      openingBrace >= 0 && closingBrace > openingBrace
        ? useExpression.slice(openingBrace + 1, closingBrace).split(",")
        : [useExpression];

    for (const binding of bindings) {
      const alias = binding.match(/\bas\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/);
      const name = alias
        ? alias[1]
        : binding.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/)?.[1];
      if (name) symbols.add(name);
    }
  }

  return symbols;
}

function pythonPublicSymbols(source) {
  const allAssignment = source.match(/__all__\s*=\s*\[([\s\S]*?)\]/);
  if (!allAssignment) return undefined;

  return new Set(
    [...allAssignment[1].matchAll(/["']([A-Za-z_][A-Za-z0-9_]*)["']/g)].map(
      (match) => match[1],
    ),
  );
}

function manualSourceSymbols(surface) {
  if (typeof surface.source !== "string" || surface.source.length === 0) {
    problems.push(`${surface.name} must declare a source file for API coverage`);
    return undefined;
  }

  const sourcePath = path.join(repoRoot, surface.source);
  if (!fs.existsSync(sourcePath)) {
    problems.push(`Missing file: ${surface.source}`);
    return undefined;
  }
  const source = fs.readFileSync(sourcePath, "utf8");

  if (surface.source.endsWith(".rs")) return rustPublicSymbols(source);
  if (surface.source.endsWith(".py")) {
    const symbols = pythonPublicSymbols(source);
    if (!symbols) {
      problems.push(
        `${surface.source} must define __all__ so its public API can be verified`,
      );
    }
    return symbols;
  }

  problems.push(
    `${surface.name} uses an unsupported manual source type: ${surface.source}`,
  );
  return undefined;
}

const allowedDocs = new Set(["intro.md", "start/package-map.md"]);

for (const [familyName, family] of Object.entries(coverage.families)) {
  const quickstartText = docText([family.quickstart]);
  const patternsText = docText([family.commonPatterns]);
  allowedDocs.add(family.quickstart);
  allowedDocs.add(family.commonPatterns);

  if (!/^# .*quickstart/im.test(quickstartText)) {
    problems.push(`${family.quickstart} must have a Quickstart H1`);
  }
  if (!/^# .*common patterns/im.test(patternsText)) {
    problems.push(`${family.commonPatterns} must have a Common Patterns H1`);
  }

  for (const guidePath of family.guides ?? []) {
    const guideText = docText([guidePath]);
    allowedDocs.add(guidePath);
    if (!/^# /m.test(guideText)) {
      problems.push(`${guidePath} must have an H1`);
    }
  }

  for (const apiPath of family.api) {
    const apiText = docText([apiPath]);
    allowedDocs.add(apiPath);
    if (!/^# .*API Documentation/im.test(apiText)) {
      problems.push(`${apiPath} must have an API Documentation H1`);
    }
  }

  if (familyName === "together" && family.api.length !== 1) {
    problems.push("Altstack Together must have one integration documentation page");
  }
}

for (const markdownPath of walkMarkdown(docsRoot)) {
  const docsRelative = path.relative(docsRoot, markdownPath).split(path.sep).join("/");
  if (!allowedDocs.has(docsRelative)) {
    problems.push(`Untracked or legacy docs page: apps/docs/docs/${docsRelative}`);
  }
}

for (const markdownPath of walkMarkdown(path.join(docsRoot, "server"))) {
  const docsRelative = path.relative(docsRoot, markdownPath).split(path.sep).join("/");
  if (
    docsRelative !== "server/combine-routers.md" &&
    readRequired(markdownPath).includes("mergeRouters")
  ) {
    problems.push(
      `Removed HTTP mergeRouters API is documented outside its migration guide: apps/docs/docs/${docsRelative}`,
    );
  }
}

for (const allowedDoc of allowedDocs) {
  readRequired(path.join(docsRoot, allowedDoc));
}

verifySidebarCoverage(allowedDocs);

const packageDirectories = fs
  .readdirSync(path.join(repoRoot, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(repoRoot, "packages", entry.name));

const publicTypescriptPackages = new Map();
for (const packageDirectory of packageDirectories) {
  const manifestPath = path.join(packageDirectory, "package.json");
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.private !== true && manifest.name?.startsWith("@alt-stack/")) {
    publicTypescriptPackages.set(manifest.name, packageDirectory);
  }
}

const configuredPackageNames = new Set(Object.keys(coverage.typescriptPackages));
for (const packageName of publicTypescriptPackages.keys()) {
  if (!configuredPackageNames.has(packageName)) {
    problems.push(`Public package missing from API coverage: ${packageName}`);
  }
}
for (const packageName of configuredPackageNames) {
  if (!publicTypescriptPackages.has(packageName)) {
    problems.push(`API coverage references a non-public or missing package: ${packageName}`);
  }
}

const entrypoints = Object.values(coverage.typescriptPackages).map((entry) =>
  path.join(repoRoot, entry.entrypoint),
);
const program = ts.createProgram(entrypoints, {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  skipLibCheck: true,
});
const checker = program.getTypeChecker();

function transitiveDocs(packageName, visited = new Set()) {
  if (visited.has(packageName)) return [];
  visited.add(packageName);
  const entry = coverage.typescriptPackages[packageName];
  if (!entry) return [];
  return [
    ...entry.docs,
    ...(entry.inherits ?? []).flatMap((inherited) =>
      transitiveDocs(inherited, visited),
    ),
  ];
}

for (const [packageName, entry] of Object.entries(
  coverage.typescriptPackages,
)) {
  const packageDirectory = publicTypescriptPackages.get(packageName);
  if (!packageDirectory) continue;

  const ownText = docText(entry.docs);
  if (!ownText.includes(packageName)) {
    problems.push(`${entry.docs.join(", ")} must name ${packageName}`);
  }

  const readmePath = path.join(packageDirectory, "README.md");
  readmesToValidate.add(readmePath);
  const readme = readRequired(readmePath);
  if (readme.length < 100 || !readme.includes(packageName)) {
    problems.push(`${relative(readmePath)} must be a substantive ${packageName} entry point`);
  }

  const entrypoint = path.join(repoRoot, entry.entrypoint);
  const sourceFile = program.getSourceFile(entrypoint);
  const moduleSymbol = sourceFile
    ? checker.getSymbolAtLocation(sourceFile)
    : undefined;
  if (!sourceFile || !moduleSymbol) {
    problems.push(`Could not inspect exports for ${packageName}`);
    continue;
  }

  const exportedSymbols = checker
    .getExportsOfModule(moduleSymbol)
    .filter((symbol) => symbol.getName() !== "default")
    .sort((left, right) => left.getName().localeCompare(right.getName()));
  const coverageText = docText(transitiveDocs(packageName));
  for (const exportedSymbol of exportedSymbols) {
    const exportedName = exportedSymbol.getName();
    if (
      !hasDescriptiveCoverage(
        coverageText,
        inlineTermMatcher(exportedName),
        exportedName,
      )
    ) {
      problems.push(
        `${packageName} export lacks descriptive documentation: ${exportedName} (add a substantive named section or descriptive table/bullet entry)`,
      );
    }

    const memberCoverage = declaredPublicMembers(
      exportedSymbol,
      packageName,
      packageDirectory,
    );
    for (const member of memberCoverage.members) {
      if (
        !hasDescriptiveMemberCoverage(
          coverageText,
          exportedName,
          member,
        )
      ) {
        problems.push(
          `${packageName}.${exportedName}.${member} lacks descriptive public-member documentation`,
        );
      }
    }
    verificationResiduals.push(...memberCoverage.residuals);
  }

  for (const term of entry.terms ?? []) {
    if (!hasInlineTerm(ownText, term)) {
      problems.push(`${packageName} required term is undocumented: ${term}`);
    }
  }
}

for (const surface of coverage.manualSurfaces) {
  const text = docText(surface.docs);
  const sourceSymbols = manualSourceSymbols(surface);
  const readmePath = path.join(repoRoot, surface.readme);
  readmesToValidate.add(readmePath);
  const readme = readRequired(readmePath);
  if (readme.length < 100 || !readme.includes(surface.name)) {
    problems.push(`${surface.readme} must be a substantive ${surface.name} entry point`);
  }
  if (!text.includes(surface.name)) {
    problems.push(`${surface.docs.join(", ")} must name ${surface.name}`);
  }
  for (const symbol of surface.symbols) {
    if (sourceSymbols && !sourceSymbols.has(symbol)) {
      problems.push(
        `${surface.name} coverage declares a symbol not publicly exported by ${surface.source}: ${symbol}`,
      );
    }
    if (!hasDescriptiveCoverage(text, inlineTermMatcher(symbol), symbol)) {
      problems.push(
        `${surface.name} export lacks descriptive documentation: ${symbol} (add a substantive named section or descriptive table/bullet entry)`,
      );
    }
  }
  if (sourceSymbols) {
    const configuredSymbols = new Set(surface.symbols);
    for (const sourceSymbol of sourceSymbols) {
      if (!configuredSymbols.has(sourceSymbol)) {
        problems.push(
          `${surface.name} public source export is missing from API coverage: ${sourceSymbol}`,
        );
      }
    }
  }
  for (const term of surface.terms ?? []) {
    if (!hasInlineTerm(text, term)) {
      problems.push(`${surface.name} required term is undocumented: ${term}`);
    }
  }
}

const examplesRoot = path.join(repoRoot, "examples");
for (const entry of fs.readdirSync(examplesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const exampleDirectory = path.join(examplesRoot, entry.name);
  if (!fs.existsSync(path.join(exampleDirectory, "package.json"))) continue;
  const readmePath = path.join(exampleDirectory, "README.md");
  readmesToValidate.add(readmePath);
  if (readRequired(readmePath).length < 100) {
    problems.push(`${relative(readmePath)} must be a substantive example entry point`);
  }
}

for (const entryPoint of ["README.md", "apps/docs/README.md"]) {
  const entryPointPath = path.join(repoRoot, entryPoint);
  readmesToValidate.add(entryPointPath);
  if (readRequired(entryPointPath).length < 100) {
    problems.push(`${entryPoint} must be a substantive documentation entry point`);
  }
}

for (const readmePath of readmesToValidate) {
  verifyLocalMarkdownLinks(readmePath);
}

const uniqueProblems = [...new Set(problems)];

if (uniqueProblems.length > 0) {
  console.error(
    `Documentation verification failed with ${uniqueProblems.length} problem(s):`,
  );
  for (const problem of uniqueProblems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(
  `Documentation verification passed: ${Object.keys(coverage.families).length} families, ` +
    `${configuredPackageNames.size} TypeScript packages, ` +
    `${coverage.manualSurfaces.length} Rust/Python surfaces.`,
);

const uniqueResiduals = [...new Set(verificationResiduals)];
if (uniqueResiduals.length > 0) {
  console.warn(
    `Documentation verification left ${uniqueResiduals.length} member-coverage residual(s) that were not asserted:`,
  );
  for (const residual of uniqueResiduals) console.warn(`- ${residual}`);
}
