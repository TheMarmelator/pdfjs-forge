import { PDFDocument } from "../../src/core/document.js";
import { Stream } from "../../src/core/stream.js";
import fs from "fs";
import {
  getPrim,
  getPrimTree, getStreamAsImage,
  getStreamAsString
} from "../../src/core/obj_walker.js";
import { retrieveXref } from "../../src/core/retrieve_xref.js";

fs.readFile(
  "/home/kschuettler/Dokumente/Scientific Papers/PDF Specification/ISO_32000-2_2020(en).pdf",
  (err, data) => {
    console.log("reading file");
    const stream = new Stream(new Uint8Array(data));
    const manager = { enableXfa: false };
    const doc = new PDFDocument(manager, stream);
    doc.parseStartXRef();
    doc.parse(false);
    console.log(doc.numPages);
    parse(doc);
  }
);

async function parse(doc) {
  // console.time("xref");
  // let table = await retrieveXref(doc);
  // console.timeEnd("xref");
  console.time("get prim");
  const prim = await getPrim("/Page2/Contents/1/", doc);
  console.timeEnd("get prim");
  // console.log(prim);
  let request = {
    key: "Page6",
    children: [
      {key: "CropBox"},
      { key: "Contents", children: [{ key: "1" }] },
      {
        key: "Resources",
        children: [{ key: "ProcSet" }],
      },
    ],
  };
  console.time("get tree");
  const tree = await getPrimTree([request], doc);
  console.timeEnd("get tree");
  logTree(tree);
  console.time("string")
  const string = await getStreamAsString("/Page2/Contents/2/Data", doc);
  console.timeEnd("string");
  console.log(string);
  console.time("image")
  // const image = await getStreamAsImage("/Page2/Contents/2/Data", doc);
  const image = await getStreamAsImage("/Page2/Resources/XObject/Im0/Data", doc);
  console.timeEnd("image");
  console.log(image);

}

function logTree(tree) {
  for (let key in tree) {
    let node = tree[key];
    let str = "  ".repeat(node.depth);
    str += !node.container ? "  " : node.expanded ? "v " : "> ";
    str += node.key + " | " + node.ptype + " | ";
    if (node.sub_type !== "-") {
      str += node.sub_type + " | ";
    }
    str += node.value;
    console.log(str);
  }
}
