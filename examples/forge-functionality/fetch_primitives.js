import {
  getImageAsBlob,
  getPrim,
  getPrimTree,
  getStreamAsString,
} from "../../src/core/obj_walker.js";
import fs from "fs";
import { PDFDocument } from "../../src/core/document.js";
import { Stream } from "../../src/core/stream.js";

const filePath =
  "C:\\Users\\kj131\\pdf-forge\\test_pdfs\\ISO_32000-2_2020(en).pdf";

fs.readFile(filePath, (err, data) => {
  if (err) {
    console.error("Error reading file:", err);
    return;
  }
  console.log("Reading file");

  const stream = new Stream(data); // No need for Uint8Array, `data` is already a buffer
  const manager = { enableXfa: false };
  const doc = new PDFDocument(manager, stream);

  try {
    doc.parseStartXRef();
    doc.parse(false);
    console.log("Number of pages:", doc.numPages);
    parse(doc);
  } catch (e) {
    console.error("Failed to parse PDF:", e);
  }
});

async function parse(doc) {
  // console.time("xref");
  // let table = await retrieveXref(doc);
  // console.timeEnd("xref");
  // console.time("get prim");
  // const prim = await getPrim("/Page2/Resources/XObject/Im0/Length", doc);
  // console.timeEnd("get prim");
  // console.log(prim);
  // const request = {
  //   key: "Page2",
  //   children: [
  //     { key: "CropBox" },
  //     { key: "Contents", children: [{ key: "1" , children: [{ key: "Length" }]}] },
  //     {
  //       key: "Resources",
  //       children: [{ key: "ProcSet" }],
  //     },
  //   ],
  // };
  // console.time("get tree");
  // const tree = await getPrimTree([request], doc);
  // console.timeEnd("get tree");
  // logTree(tree);
  console.time("string");
  const string = await getStreamAsString("/Page2/Contents/0/Data", doc);
  console.timeEnd("string");
  console.log(string);
  // const handler = { send: undefined };
  // console.time("image");
  // // const image = await getStreamAsImage("/Page2/Contents/2/Data", doc);
  // const image = await getImageAsBlob(
  //   "/Page2/Resources/XObject/Im0/Data",
  //   doc,
  //   handler
  // );
  // console.timeEnd("image");
  // console.log(image);
}

function logTree(tree) {
  for (const node of tree) {
    let str = "  ".repeat(node.depth);
    if (!node.container) {
      str += "  ";
    } else {
      str += node.expanded ? "v " : "> ";
    }
    str += node.key + " | " + node.ptype + " | ";
    // if (node.sub_type !== "-") {
    //   str += node.sub_type + " | ";
    // }
    // str += node.value;
    str += node.trace.map(t => t.key).join(", ");
    console.log(str);
  }
}
