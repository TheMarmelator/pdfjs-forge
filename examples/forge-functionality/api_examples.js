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
  process.argv[2] || "C:\\Users\\kj131\\pdf-forge\\test_pdfs\\ISO_32000-2_2020(en).pdf";
const data = new Uint8Array(fs.readFileSync(pdfPath));

// Load the PDF file.
const loadingTask = getDocument({
  data,
  cMapUrl: CMAP_URL,
  cMapPacked: CMAP_PACKED,
  standardFontDataUrl: STANDARD_FONT_DATA_URL,
});
test(loadingTask);
async function test(loading) {
  try {
    const pdfDocument = await loading.promise;
    console.log("# PDF document loaded.");
    const page = await pdfDocument.getPage(4);
    printOpList(page);
    console.time("contents");
    const contents = await page.getContents();
    console.timeEnd("contents");
    console.time("oplist");
    const opList = await page.getOperatorList();
    console.timeEnd("oplist");
    // console.log(opList);
    let newContents = "";
    for (let i = 0; i < 5; i++) {
      const range = opList.rangeArray[i];
      if (range) {
        newContents += contents.slice(range[0], range[1]);
        newContents += "\n";
      }
    }
    console.log(newContents);
    await page.updateContents(newContents);
    await printOpList(page);
  } catch (e) {
    console.error(e);
  }
}

async function printOpList(page) {
  const contents = await page.getContents();
  const opList = await page.getOperatorList();
  // console.log(opList);
  const ops = [];
  for (let i = 0; i < opList.rangeArray.length; i++) {
    const range = opList.rangeArray[i];
    if (range) {
      ops.push(contents.slice(range[0], range[1]));
    }
  }
  console.log(ops.slice(0, 100));
}
