const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Parses the ZIP Central Directory to locate and extract a named entry.
// Returns the decompressed text content, or null if not found/unsupported.
async function extractZipEntry(buffer, targetFilename) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Locate End of Central Directory (signature 0x06054b50)
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return null;

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  let cdPos = cdOffset;

  while (cdPos < cdOffset + cdSize) {
    if (view.getUint32(cdPos, true) !== 0x02014b50) break;

    const compressionMethod = view.getUint16(cdPos + 10, true);
    const compressedSize = view.getUint32(cdPos + 20, true);
    const filenameLength = view.getUint16(cdPos + 28, true);
    const extraLength = view.getUint16(cdPos + 30, true);
    const commentLength = view.getUint16(cdPos + 32, true);
    const localOffset = view.getUint32(cdPos + 42, true);
    const filename = new TextDecoder().decode(bytes.slice(cdPos + 46, cdPos + 46 + filenameLength));

    if (filename === targetFilename) {
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const localFilenameLength = view.getUint16(localOffset + 26, true);
      const dataStart = localOffset + 30 + localFilenameLength + localExtraLength;
      const compressedData = bytes.slice(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        return new TextDecoder().decode(compressedData);
      }
      if (compressionMethod === 8) {
        if (typeof DecompressionStream === 'undefined') return null;
        const ds = new DecompressionStream('deflate-raw');
        const inputStream = new ReadableStream({
          start(controller) {
            controller.enqueue(compressedData);
            controller.close();
          },
        });
        const decompressed = await new Response(inputStream.pipeThrough(ds)).arrayBuffer();
        return new TextDecoder().decode(decompressed);
      }
      return null;
    }

    cdPos += 46 + filenameLength + extraLength + commentLength;
  }
  return null;
}

export async function getDocxPageCount(file) {
  if (file.type !== DOCX_MIME) return null;
  try {
    const buffer = await file.arrayBuffer();
    const xml = await extractZipEntry(buffer, 'docProps/app.xml');
    if (!xml) return null;
    const match = xml.match(/<Pages>(\d+)<\/Pages>/i);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}
