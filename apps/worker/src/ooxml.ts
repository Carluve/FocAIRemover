/**
 * Word (.docx) cleaning inside the Worker.
 *
 * A .docx is a ZIP of XML parts, so everything this repo can already do to
 * text — Layer A invisible-Unicode stripping — applies to the document body
 * without a remote cleaner. On top of that we strip the OOXML metadata parts
 * that actually carry provenance (docProps/core.xml, app.xml, custom.xml) and
 * drop any C2PA manifest embedded in the package.
 *
 * What this does NOT do: statistical / token-sampling text watermarks (Layer B),
 * and Word revision-save IDs (w:rsid), which are a fingerprint but not an AI
 * provenance mark. Both stay out so the report can stay honest.
 */

import { cleanLayerA } from "./layerA.ts";
import { looksLikeZip, readZip, writeZip, ZipError, type ZipEntry } from "./zip.ts";

export const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const WORKER_OOXML_EXTENSIONS = new Set(["docx"]);

const BOM = "﻿";

/** Metadata elements removed wholesale from docProps/core.xml. */
const CORE_PROPS_DROP = [
  "dc:creator",
  "cp:lastModifiedBy",
  "cp:revision",
  "cp:lastPrinted",
  "dcterms:created",
  "dcterms:modified",
  "cp:keywords",
  "dc:description",
  "dc:subject",
  "cp:category",
  "cp:contentStatus",
];

/** Producer fingerprints removed from docProps/app.xml. */
const APP_PROPS_DROP = ["Application", "AppVersion", "Company", "Manager", "Template", "TotalTime"];

/**
 * Custom-property name tokens that mark a document as machine generated.
 * Matched per token, not as substrings: "ai" must not fire on "Email".
 */
const AI_PROPERTY_TOKENS = new Set([
  "ai",
  "llm",
  "gpt",
  "chatgpt",
  "openai",
  "claude",
  "anthropic",
  "gemini",
  "bard",
  "copilot",
  "synthid",
  "c2pa",
  "contentcredential",
  "contentcredentials",
  "provenance",
  "watermark",
  "generator",
  "generated",
]);

/** Package parts that are provenance manifests rather than document content. */
const PROVENANCE_PART = /(^|\/)(c2pa|contentcredentials)[^/]*(\/|$)|\.c2pa$/i;

export type DocxReport = {
  kind: "docx";
  layer: "A";
  backend: "worker-ooxml";
  removedCount: number;
  removed: Record<string, number>;
  parts_cleaned: string[];
  actions: string[];
  still_has_c2pa: boolean;
  layer_b: string;
};

export type DocxCleanResult = {
  cleaned: Uint8Array;
  report: DocxReport;
};

export function isWorkerOoxmlExtension(extension: string): boolean {
  return WORKER_OOXML_EXTENSIONS.has(extension.toLowerCase());
}

export class DocxError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "DocxError";
    this.code = code;
  }
}

export async function cleanDocx(bytes: Uint8Array): Promise<DocxCleanResult> {
  if (!looksLikeZip(bytes)) {
    throw new DocxError(
      "not_docx: a .docx must be an OOXML package (legacy .doc is not supported)",
      "not_docx",
    );
  }

  let entries: ZipEntry[];
  try {
    entries = await readZip(bytes);
  } catch (err) {
    if (err instanceof ZipError) {
      throw new DocxError(`not_docx: ${err.message}`, err.code);
    }
    throw err;
  }

  if (!entries.some((entry) => entry.name === "word/document.xml")) {
    throw new DocxError("not_docx: package has no word/document.xml", "not_docx");
  }

  const removed: Record<string, number> = {};
  const partsCleaned: string[] = [];
  const actions: string[] = [];
  let removedCount = 0;

  const dropped = entries.filter((entry) => PROVENANCE_PART.test(entry.name)).map((e) => e.name);
  const kept = entries.filter((entry) => !PROVENANCE_PART.test(entry.name));
  if (dropped.length) {
    actions.push(`removed provenance parts: ${dropped.join(", ")}`);
  }

  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const encoder = new TextEncoder();
  const out: ZipEntry[] = [];

  for (const entry of kept) {
    if (!isXmlPart(entry.name) || entry.data.byteLength === 0) {
      out.push(entry);
      continue;
    }

    let xml: string;
    try {
      xml = decoder.decode(entry.data);
    } catch {
      // A part that is not valid UTF-8 is not text we can safely rewrite.
      out.push(entry);
      continue;
    }

    // A leading BOM is not a provenance mark; putting it back keeps the diff
    // limited to what we meant to change.
    const hadBom = xml.startsWith(BOM);
    const body = hadBom ? xml.slice(1) : xml;

    let next = body;
    if (dropped.length) {
      next = dropReferences(entry.name, next, dropped);
    }
    next = scrubMetadataPart(entry.name, next, actions);

    const layerA = cleanLayerA(next);
    if (layerA.removedCount > 0) {
      partsCleaned.push(entry.name);
      removedCount += layerA.removedCount;
      for (const [key, count] of Object.entries(layerA.removed)) {
        removed[key] = (removed[key] ?? 0) + count;
      }
    }
    next = layerA.cleaned;

    if (next === body) {
      out.push(entry);
      continue;
    }
    out.push({ ...entry, data: encoder.encode(hadBom ? BOM + next : next) });
  }

  const cleaned = await writeZip(out);
  return {
    cleaned,
    report: {
      kind: "docx",
      layer: "A",
      backend: "worker-ooxml",
      removedCount,
      removed,
      parts_cleaned: partsCleaned,
      actions,
      still_has_c2pa: false,
      layer_b: "not applied; statistical text watermarks are NOT addressed here",
    },
  };
}

function isXmlPart(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".xml") || lower.endsWith(".rels");
}

function scrubMetadataPart(name: string, xml: string, actions: string[]): string {
  const lower = name.toLowerCase();
  if (lower === "docprops/core.xml") {
    return dropElements(xml, CORE_PROPS_DROP, actions, "docProps/core.xml");
  }
  if (lower === "docprops/app.xml") {
    return dropElements(xml, APP_PROPS_DROP, actions, "docProps/app.xml");
  }
  if (lower === "docprops/custom.xml") {
    return dropAiCustomProperties(xml, actions);
  }
  return xml;
}

function dropElements(xml: string, tags: string[], actions: string[], part: string): string {
  let out = xml;
  const gone: string[] = [];
  for (const tag of tags) {
    const escaped = escapeRegExp(tag);
    const pattern = new RegExp(`<${escaped}(?:\\s[^>]*)?(?:/>|>[\\s\\S]*?</${escaped}>)`, "g");
    const next = out.replace(pattern, "");
    if (next !== out) gone.push(tag);
    out = next;
  }
  if (gone.length) actions.push(`stripped from ${part}: ${gone.join(", ")}`);
  return out;
}

function dropAiCustomProperties(xml: string, actions: string[]): string {
  const gone: string[] = [];
  const out = xml.replace(/<property\b[\s\S]*?<\/property>/g, (block) => {
    const name = /\bname="([^"]*)"/.exec(block)?.[1] ?? "";
    if (!isAiPropertyName(name)) return block;
    gone.push(name);
    return "";
  });
  if (gone.length) actions.push(`stripped from docProps/custom.xml: ${gone.join(", ")}`);
  return out;
}

export function isAiPropertyName(name: string): boolean {
  const tokens = name
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.some((token) => AI_PROPERTY_TOKENS.has(token))) return true;
  // Two-word markers ("content credentials", "ContentCredentials") arrive
  // already split by the pass above, so rejoin neighbours before matching.
  return tokens.some((token, i) => i > 0 && AI_PROPERTY_TOKENS.has(tokens[i - 1]! + token));
}

/**
 * A dropped part still referenced from `[Content_Types].xml` or a `.rels` part
 * makes Word refuse the file, so the references go with it.
 */
function dropReferences(name: string, xml: string, droppedParts: string[]): string {
  const lower = name.toLowerCase();
  let out = xml;
  for (const part of droppedParts) {
    if (lower === "[content_types].xml") {
      const target = escapeRegExp(`/${part}`);
      out = out.replace(new RegExp(`<Override\\b[^>]*PartName="${target}"[^>]*/>`, "gi"), "");
    } else if (lower.endsWith(".rels")) {
      const base = escapeRegExp(part.split("/").pop() ?? part);
      out = out.replace(new RegExp(`<Relationship\\b[^>]*Target="[^"]*${base}"[^>]*/>`, "gi"), "");
    }
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
