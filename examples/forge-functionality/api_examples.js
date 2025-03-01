import fs from "fs";
import { getDocument } from "../../build/dist/build/pdf.mjs";

// Some PDFs need external cmaps.
const CMAP_URL = "../../../node_modules/pdfjs-dist/cmaps/";
const CMAP_PACKED = true;

// Where the standard fonts are located.
const STANDARD_FONT_DATA_URL =
  "../../../node_modules/pdfjs-dist/standard_fonts/";

// Loading file from file system into typed array.
const pdfPath =
  process.argv[2] || "../../web/compressed.tracemonkey-pldi-09.pdf";
const data = new Uint8Array(fs.readFileSync(pdfPath));

// Load the PDF file.
const loadingTask = getDocument({
  data,
  cMapUrl: CMAP_URL,
  cMapPacked: CMAP_PACKED,
  standardFontDataUrl: STANDARD_FONT_DATA_URL,
});
try {
  const pdfDocument = await loadingTask.promise;
  console.log("# PDF document loaded.");
  const table = await pdfDocument.getStreamAsString("/Page2/Contents/0/Data");
  console.log(table);
} catch (e) {
  console.error(e);
}
