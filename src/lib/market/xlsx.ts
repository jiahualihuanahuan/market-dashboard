import { inflateRawSync } from "node:zlib";

const LOCAL = 0x04034b50;

export function readSheet(buffer: Buffer): string[][] {
  const shared = parseShared(unzip(buffer, "xl/sharedStrings.xml"));
  const sheet = unzip(buffer, "xl/worksheets/sheet1.xml").toString("utf8");
  const rows: string[][] = [];
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    let cursor = 0;
    for (const cell of row[1].matchAll(/<c\b([^>]*)>(?:<v>([^<]*)<\/v>)?/g)) {
      const ref = cell[1].match(/\br="([A-Z]+)\d+"/)?.[1] ?? "";
      const column = columnIndex(ref);
      while (cells.length < column) cells.push("");
      const kind = cell[1].match(/\bt="([^"]+)"/)?.[1];
      const raw = cell[2] ?? "";
      cells[column] = kind === "s" ? shared[Number(raw)] ?? "" : raw;
      cursor = column + 1;
    }
    if (cursor) rows.push(cells);
  }
  return rows;
}

function unzip(buffer: Buffer, name: string): Buffer {
  const entry = centralDirectory(buffer).find((item) => item.name === name);
  if (!entry) throw new Error(`Missing ${name}`);
  const offset = entry.offset;
  if (buffer.readUInt32LE(offset) !== LOCAL) throw new Error(`Bad zip entry ${name}`);
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + entry.size);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error(`Cannot read ${name}`);
}

function centralDirectory(buffer: Buffer): { name: string; method: number; size: number; offset: number }[] {
  let end = -1;
  const scan = Math.max(0, buffer.length - 66_000);
  for (let index = buffer.length - 22; index >= scan; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error("The workbook has no directory.");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries: { name: string; method: number; size: number; offset: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.push({ name: fileName, method, size, offset: local });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function parseShared(xml: Buffer): string[] {
  const text = xml.toString("utf8");
  const out: string[] = [];
  for (const item of text.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts = [...item[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decode(match[1]));
    out.push(parts.join(""));
  }
  return out;
}

function columnIndex(letters: string): number {
  let value = 0;
  for (const letter of letters) value = value * 26 + (letter.charCodeAt(0) - 64);
  return value - 1;
}

function decode(value: string): string {
  return value
    .replaceAll("&" + "amp;", "&")
    .replaceAll("&" + "lt;", "<")
    .replaceAll("&" + "gt;", ">")
    .replaceAll("&" + "quot;", '"')
    .replaceAll("&" + "apos;", "'");
}
