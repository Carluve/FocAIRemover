/**
 * Minimal ZIP reader/writer for the Worker runtime.
 *
 * OOXML (.docx) is a ZIP of XML parts, so cleaning one in the Worker means
 * unzipping, rewriting parts, and rezipping — no container, no native deps.
 * Compression uses the platform's `deflate-raw` streams (workerd and Node 21+).
 *
 * Deliberately small: the central directory is the source of truth, Zip64 and
 * encrypted archives are rejected rather than half-supported.
 */

export type ZipEntry = {
  /** Path inside the archive, e.g. `word/document.xml`. */
  name: string;
  data: Uint8Array;
  /** Preserved so a rewrite does not silently restamp the archive. */
  dosTime: number;
  dosDate: number;
  externalAttributes: number;
  /** Directory entries and ODF/EPUB `mimetype` must stay uncompressed. */
  stored: boolean;
};

export class ZipError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ZipError";
    this.code = code;
  }
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;
const ZIP64_SENTINEL = 0xffffffff;
const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8_NAMES = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

export function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  );
}

export async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);

  const total = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (centralOffset === ZIP64_SENTINEL || centralSize === ZIP64_SENTINEL || total === 0xffff) {
    throw new ZipError("Zip64 archives are not supported", "zip64_unsupported");
  }

  const entries: ZipEntry[] = [];
  let cursor = centralOffset;
  for (let i = 0; i < total; i++) {
    if (cursor + 46 > bytes.byteLength || view.getUint32(cursor, true) !== CENTRAL_SIG) {
      throw new ZipError("central directory is malformed", "zip_central_malformed");
    }
    const flags = view.getUint16(cursor + 8, true);
    if (flags & FLAG_ENCRYPTED) {
      throw new ZipError("encrypted archives are not supported", "zip_encrypted");
    }
    const method = view.getUint16(cursor + 10, true);
    const dosTime = view.getUint16(cursor + 12, true);
    const dosDate = view.getUint16(cursor + 14, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const externalAttributes = view.getUint32(cursor + 38, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (compressedSize === ZIP64_SENTINEL || uncompressedSize === ZIP64_SENTINEL || localOffset === ZIP64_SENTINEL) {
      throw new ZipError("Zip64 archives are not supported", "zip64_unsupported");
    }
    const name = decodeName(bytes.subarray(cursor + 46, cursor + 46 + nameLen));

    const data = await readLocalData(bytes, view, localOffset, method, compressedSize, name);
    if (data.byteLength !== uncompressedSize) {
      throw new ZipError(`size mismatch for ${name}`, "zip_size_mismatch");
    }

    entries.push({
      name,
      data,
      dosTime,
      dosDate,
      externalAttributes,
      stored: method === METHOD_STORE,
    });
    cursor += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

export async function writeZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const store = entry.stored || entry.data.byteLength === 0;
    const payload = store ? entry.data : await deflateRaw(entry.data);
    // Deflate can inflate tiny/incompressible parts; never pay for that.
    const useStore = store || payload.byteLength >= entry.data.byteLength;
    const body = useStore ? entry.data : payload;
    const method = useStore ? METHOD_STORE : METHOD_DEFLATE;

    const local = new Uint8Array(30 + nameBytes.byteLength);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, LOCAL_SIG, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, FLAG_UTF8_NAMES, true);
    localView.setUint16(8, method, true);
    localView.setUint16(10, entry.dosTime, true);
    localView.setUint16(12, entry.dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, body.byteLength, true);
    localView.setUint32(22, entry.data.byteLength, true);
    localView.setUint16(26, nameBytes.byteLength, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.byteLength);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, CENTRAL_SIG, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, FLAG_UTF8_NAMES, true);
    centralView.setUint16(10, method, true);
    centralView.setUint16(12, entry.dosTime, true);
    centralView.setUint16(14, entry.dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, body.byteLength, true);
    centralView.setUint32(24, entry.data.byteLength, true);
    centralView.setUint16(28, nameBytes.byteLength, true);
    centralView.setUint32(38, entry.externalAttributes, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local, body);
    centrals.push(central);
    offset += local.byteLength + body.byteLength;
  }

  const centralOffset = offset;
  const centralSize = centrals.reduce((acc, part) => acc + part.byteLength, 0);
  const eocd = new Uint8Array(EOCD_MIN_SIZE);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, EOCD_SIG, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, centralOffset, true);

  return concat([...locals, ...centrals, eocd]);
}

async function readLocalData(
  bytes: Uint8Array,
  view: DataView,
  localOffset: number,
  method: number,
  compressedSize: number,
  name: string,
): Promise<Uint8Array> {
  if (localOffset + 30 > bytes.byteLength || view.getUint32(localOffset, true) !== LOCAL_SIG) {
    throw new ZipError(`local header missing for ${name}`, "zip_local_missing");
  }
  // The local header's own name/extra lengths win: they may differ from the
  // central directory's, and the data starts right after them.
  const nameLen = view.getUint16(localOffset + 26, true);
  const extraLen = view.getUint16(localOffset + 28, true);
  const start = localOffset + 30 + nameLen + extraLen;
  const end = start + compressedSize;
  if (end > bytes.byteLength) {
    throw new ZipError(`truncated data for ${name}`, "zip_truncated");
  }
  const raw = bytes.subarray(start, end);
  if (method === METHOD_STORE) return raw.slice();
  if (method === METHOD_DEFLATE) return await inflateRaw(raw);
  throw new ZipError(`unsupported compression method ${method} for ${name}`, "zip_method_unsupported");
}

function findEocd(view: DataView): number {
  const min = Math.max(0, view.byteLength - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let i = view.byteLength - EOCD_MIN_SIZE; i >= min; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  throw new ZipError("not a ZIP archive (no end of central directory)", "zip_no_eocd");
}

function decodeName(bytes: Uint8Array): string {
  // Always UTF-8: OOXML part names are ASCII, and the legacy CP437 alternative
  // would only mis-key parts we then fail to find.
  return new TextDecoder("utf-8").decode(bytes);
}

export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (data.byteLength === 0) return new Uint8Array(0);
  return await pipe(data, new DecompressionStream("deflate-raw"));
}

export async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (data.byteLength === 0) return new Uint8Array(0);
  return await pipe(data, new CompressionStream("deflate-raw"));
}

async function pipe(
  data: Uint8Array,
  transform: TransformStream<ArrayBuffer | ArrayBufferView, Uint8Array>,
): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const buffer = await new Response(source.pipeThrough(transform)).arrayBuffer();
  return new Uint8Array(buffer);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((acc, part) => acc + part.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.byteLength; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
