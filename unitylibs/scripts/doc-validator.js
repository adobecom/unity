const DOC_MIME = 'application/msword';
const OLE2_MAGIC = new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
const ENDOFCHAIN = 0xFFFFFFFE;
const PID_PAGECOUNT = 0x0E;
const VT_I4 = 3;

function fatChain(fat, start) {
  const sectors = [];
  let s = start;
  while (s < ENDOFCHAIN && sectors.length <= fat.length) {
    sectors.push(s);
    s = fat[s];
  }
  return sectors;
}

function readSectors(bytes, fat, start, size, sectorSize) {
  const out = new Uint8Array(size);
  let pos = 0;
  for (const s of fatChain(fat, start)) {
    const base = (s + 1) * sectorSize;
    const n = Math.min(sectorSize, size - pos);
    out.set(bytes.slice(base, base + n), pos);
    pos += n;
    if (pos >= size) break;
  }
  return out;
}

function readMiniSectors(mini, miniFat, start, size, miniSectorSize) {
  const out = new Uint8Array(size);
  let pos = 0;
  for (const s of fatChain(miniFat, start)) {
    const base = s * miniSectorSize;
    const n = Math.min(miniSectorSize, size - pos);
    out.set(mini.slice(base, base + n), pos);
    pos += n;
    if (pos >= size) break;
  }
  return out;
}

export async function getDocPageCount(file) {
  if (file.type !== DOC_MIME) return null;
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    if (!OLE2_MAGIC.every((b, i) => bytes[i] === b)) return null;

    const sectorSize = 1 << view.getUint16(0x1E, true);
    const miniSectorSize = 1 << view.getUint16(0x20, true);
    const totalFatSectors = view.getUint32(0x2C, true);
    const dirStart = view.getUint32(0x30, true);
    const miniCutoff = view.getUint32(0x38, true);
    const miniFatStart = view.getUint32(0x3C, true);

    const fatSectors = [];
    for (let i = 0; i < 109; i++) {
      const s = view.getUint32(0x4C + i * 4, true);
      if (s >= ENDOFCHAIN) break;
      fatSectors.push(s);
    }
    const difatStart = view.getUint32(0x44, true);
    if (difatStart < ENDOFCHAIN) {
      const slotsPerDifat = sectorSize / 4 - 1;
      let difatSector = difatStart;
      while (difatSector < ENDOFCHAIN) {
        const base = (difatSector + 1) * sectorSize;
        for (let j = 0; j < slotsPerDifat; j++) {
          const s = view.getUint32(base + j * 4, true);
          if (s >= ENDOFCHAIN) break;
          fatSectors.push(s);
        }
        difatSector = view.getUint32(base + slotsPerDifat * 4, true);
      }
    }
    const fat = new Uint32Array(totalFatSectors * (sectorSize / 4));
    let fatIdx = 0;
    for (const fatSector of fatSectors) {
      const base = (fatSector + 1) * sectorSize;
      for (let j = 0; j < sectorSize / 4; j++) {
        fat[fatIdx++] = view.getUint32(base + j * 4, true);
      }
    }

    const entries = [];
    for (const s of fatChain(fat, dirStart)) {
      const base = (s + 1) * sectorSize;
      for (let i = 0; i < sectorSize / 128; i++) {
        const eb = base + i * 128;
        const nameLen = view.getUint16(eb + 64, true);
        if (nameLen < 2) { entries.push(null); continue; }
        const name = new TextDecoder('utf-16le').decode(bytes.slice(eb, eb + nameLen - 2));
        entries.push({
          name,
          type: bytes[eb + 66],
          start: view.getUint32(eb + 116, true),
          size: view.getUint32(eb + 120, true),
        });
      }
    }

    const root = entries[0];
    if (!root) return null;

    let miniStream = null;
    let miniFat = null;
    if (miniFatStart < ENDOFCHAIN) {
      const mfatArr = [];
      for (const s of fatChain(fat, miniFatStart)) {
        const base = (s + 1) * sectorSize;
        for (let j = 0; j < sectorSize / 4; j++) mfatArr.push(view.getUint32(base + j * 4, true));
      }
      miniFat = new Uint32Array(mfatArr);
      miniStream = readSectors(bytes, fat, root.start, root.size, sectorSize);
    }

    const si = entries.find((e) => e?.name === 'SummaryInformation');
    if (!si) return null;

    const siData = si.size < miniCutoff && miniStream && miniFat
      ? readMiniSectors(miniStream, miniFat, si.start, si.size, miniSectorSize)
      : readSectors(bytes, fat, si.start, si.size, sectorSize);

    const sv = new DataView(siData.buffer);
    const sectionOffset = sv.getUint32(44, true);
    const propCount = sv.getUint32(sectionOffset + 4, true);
    for (let i = 0; i < propCount; i++) {
      const base = sectionOffset + 8 + i * 8;
      if (sv.getUint32(base, true) === PID_PAGECOUNT) {
        const off = sv.getUint32(base + 4, true);
        if (sv.getUint32(sectionOffset + off, true) === VT_I4) {
          return sv.getInt32(sectionOffset + off + 4, true);
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
