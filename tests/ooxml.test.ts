import assert from "node:assert/strict";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import {
  cleanDocx,
  DocxError,
  isAiPropertyName,
  isWorkerOoxmlExtension,
} from "../apps/worker/src/ooxml.ts";
import { readZip, writeZip, type ZipEntry } from "../apps/worker/src/zip.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });

function part(name: string, xml: string, stored = false): ZipEntry {
  return {
    name,
    data: encoder.encode(xml),
    dosTime: 0x6000,
    dosDate: 0x5929,
    externalAttributes: 0,
    stored,
  };
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const CORE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
<dc:title>Informe</dc:title><dc:creator>ChatGPT</dc:creator><cp:lastModifiedBy>Claude</cp:lastModifiedBy><cp:revision>3</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-01-02T00:00:00Z</dcterms:modified>
</cp:coreProperties>`;

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>Microsoft Office Word</Application><AppVersion>16.0000</AppVersion><Company>ACME</Company><Pages>2</Pages>
</Properties>`;

const CUSTOM_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
<property fmtid="{D5CD}" pid="2" name="AIGenerated"><vt:bool>true</vt:bool></property>
<property fmtid="{D5CD}" pid="3" name="ProjectEmail"><vt:lpwstr>keep me</vt:lpwstr></property>
</Properties>`;

/** Body carries a ZWSP, a bidi override and a soft hyphen between words. */
const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">Hola​mundo‮ con guion­ suave</w:t></w:r></w:p></w:body></w:document>`;

async function buildDocx(extra: ZipEntry[] = []): Promise<Uint8Array> {
  return await writeZip([
    part("[Content_Types].xml", CONTENT_TYPES),
    part("_rels/.rels", ROOT_RELS),
    part("word/document.xml", DOCUMENT_XML),
    part("docProps/core.xml", CORE_XML),
    part("docProps/app.xml", APP_XML),
    part("docProps/custom.xml", CUSTOM_XML),
    ...extra,
  ]);
}

async function partsOf(zip: Uint8Array): Promise<Map<string, string>> {
  const entries = await readZip(zip);
  return new Map(entries.map((entry) => [entry.name, decoder.decode(entry.data)]));
}

test("zip round-trips through the platform deflate", async () => {
  const original = "x".repeat(500) + "unique tail";
  const zip = await writeZip([part("a/b.xml", original)]);
  const back = await partsOf(zip);
  assert.equal(back.get("a/b.xml"), original);
});

test("zip output is real deflate-raw, readable by node:zlib", async () => {
  const zip = await writeZip([part("word/document.xml", DOCUMENT_XML.repeat(4))]);
  // Local header: 30 bytes + name length, then the compressed body.
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const method = view.getUint16(8, true);
  assert.equal(method, 8, "repeated XML should compress");
  const compressedSize = view.getUint32(18, true);
  const nameLen = view.getUint16(26, true);
  const extraLen = view.getUint16(28, true);
  const start = 30 + nameLen + extraLen;
  const body = zip.subarray(start, start + compressedSize);
  assert.equal(decoder.decode(inflateRawSync(body)), DOCUMENT_XML.repeat(4));
});

test("docx keeps its parts and strips invisible Unicode from the body", async () => {
  const { cleaned, report } = await cleanDocx(await buildDocx());
  const parts = await partsOf(cleaned);

  assert.deepEqual(
    [...parts.keys()],
    [
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "docProps/core.xml",
      "docProps/app.xml",
      "docProps/custom.xml",
    ],
  );
  const body = parts.get("word/document.xml") ?? "";
  assert.match(body, />Holamundo con guion suave</);
  assert.ok(!/[​‮­]/.test(body), "no invisible code points left");
  assert.equal(report.removedCount, 3);
  assert.equal(report.removed["U+200B"], 1);
  assert.equal(report.removed["U+202E"], 1);
  assert.equal(report.removed["U+00AD"], 1);
  assert.deepEqual(report.parts_cleaned, ["word/document.xml"]);
  assert.equal(report.backend, "worker-ooxml");
});

test("docx strips authorship and producer metadata but keeps the title", async () => {
  const { cleaned, report } = await cleanDocx(await buildDocx());
  const parts = await partsOf(cleaned);

  const core = parts.get("docProps/core.xml") ?? "";
  assert.match(core, /<dc:title>Informe<\/dc:title>/);
  for (const gone of ["dc:creator", "cp:lastModifiedBy", "cp:revision", "dcterms:created", "dcterms:modified"]) {
    assert.ok(!core.includes(`<${gone}`), `${gone} should be gone`);
  }
  assert.ok(!core.includes("ChatGPT") && !core.includes("Claude"));

  const app = parts.get("docProps/app.xml") ?? "";
  assert.ok(!app.includes("<Application>") && !app.includes("<Company>"));
  assert.match(app, /<Pages>2<\/Pages>/, "non-provenance stats survive");

  const custom = parts.get("docProps/custom.xml") ?? "";
  assert.ok(!custom.includes("AIGenerated"));
  assert.match(custom, /ProjectEmail/, "unrelated custom properties survive");

  assert.ok(report.actions.some((a) => a.includes("docProps/core.xml")));
});

test("docx drops an embedded C2PA manifest and its references", async () => {
  const contentTypes = CONTENT_TYPES.replace(
    "</Types>",
    '<Override PartName="/word/c2pa.bin" ContentType="application/c2pa"/></Types>',
  );
  const rels = ROOT_RELS.replace(
    "</Relationships>",
    '<Relationship Id="rId9" Type="http://c2pa.org/manifest" Target="word/c2pa.bin"/></Relationships>',
  );
  const zip = await writeZip([
    part("[Content_Types].xml", contentTypes),
    part("_rels/.rels", rels),
    part("word/document.xml", DOCUMENT_XML),
    part("word/c2pa.bin", "jumbf-manifest-bytes", true),
  ]);

  const { cleaned, report } = await cleanDocx(zip);
  const parts = await partsOf(cleaned);
  assert.ok(!parts.has("word/c2pa.bin"));
  assert.ok(!(parts.get("[Content_Types].xml") ?? "").includes("c2pa"));
  assert.ok(!(parts.get("_rels/.rels") ?? "").includes("c2pa"));
  assert.equal(report.still_has_c2pa, false);
  assert.ok(report.actions.some((a) => a.includes("removed provenance parts")));
});

test("docx cleaning preserves a leading BOM", async () => {
  const zip = await writeZip([
    part("[Content_Types].xml", CONTENT_TYPES),
    part("word/document.xml", "﻿" + DOCUMENT_XML),
  ]);
  const { cleaned } = await cleanDocx(zip);
  const parts = await partsOf(cleaned);
  assert.ok((parts.get("word/document.xml") ?? "").startsWith("﻿"));
});

test("non-OOXML input is rejected as not_docx, never as a cleaner error", async () => {
  await assert.rejects(
    () => cleanDocx(encoder.encode("\xd0\xcf\x11\xe0 legacy .doc")),
    (err: unknown) => err instanceof DocxError && err.code === "not_docx",
  );
  const zipWithoutDocument = await writeZip([part("[Content_Types].xml", CONTENT_TYPES)]);
  await assert.rejects(
    () => cleanDocx(zipWithoutDocument),
    (err: unknown) => err instanceof DocxError && err.code === "not_docx",
  );
});

test("docx routes to the Worker, other Office formats do not", () => {
  assert.equal(isWorkerOoxmlExtension("docx"), true);
  assert.equal(isWorkerOoxmlExtension("DOCX"), true);
  assert.equal(isWorkerOoxmlExtension("pdf"), false);
  assert.equal(isWorkerOoxmlExtension("xlsx"), false);
});

test("AI custom-property matching is token-based, not substring", () => {
  assert.equal(isAiPropertyName("AIGenerated"), true);
  assert.equal(isAiPropertyName("generator"), true);
  assert.equal(isAiPropertyName("content_credentials"), true);
  assert.equal(isAiPropertyName("Email"), false);
  assert.equal(isAiPropertyName("Chairman"), false);
  assert.equal(isAiPropertyName("Maintainer"), false);
});
