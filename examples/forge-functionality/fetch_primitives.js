import { EvaluatorPreprocessor } from "../../src/core/evaluator.js";
import {
  getImageAsBlob,
  getPrim,
  getPrimitive,
  getPrimTree,
  getStreamAsString,
} from "../../src/core/obj_walker.js";
import { Lexer, Parser } from "../../src/core/parser.js";
import { EOF } from "../../src/core/primitives.js";
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

function bytesToString(bytes) {
  let string = "";
  for (let i = 0; i < bytes.length; i++) {
    string += String.fromCharCode(bytes[i]);
  }
  return string;
}

async function parse(doc) {
  const path = "/Page2/Contents/1";
  let [stream] = await getPrimitive(path, doc);
  const lexer = new Lexer(stream);
  const parser = new Parser({ lexer, xref: doc.xref, trackRanges: true });
  const objs = [];
  let [obj, start, end] = parser.getObjWithRange();
  while (obj !== EOF) {
    if (obj.cmd) {
      objs.push([obj.cmd, start, end]);
    } else {
      objs.push([obj, start, end]);
    }
    [obj, start, end] = parser.getObjWithRange();
  }
  [stream] = await getPrimitive(path, doc);
  const bytes = stream.getBytes();
  const classes = new Set();
  for (const o of objs) {
    // console.log(o[0].constructor.name);
    classes.add(o[0].constructor.name);
    const lexemmeBytes = bytes.slice(o[1], o[2]);
    // console.log(bytesToString(lexemmeBytes));
  }
  // console.log("unique classes", classes);
  [stream] = await getPrimitive(path, doc);
  const preprocessor = new EvaluatorPreprocessor(stream, doc.xref);
  const operation = {};
  operation.args = null;
  while (preprocessor.read(operation)) {
    const args = operation.args;
    const fn = operation.fn;
    const range = operation.range;
    const op = bytesToString(bytes.slice(range[0], range[1]));
    // console.log(args, fn);
    // console.log(`----------------- ${range} -------------------`);
    console.log(`${fn}: ${op}`);
    // console.log(`---------------------------------------------`);
  }
  // console.time("xref");
  // let table = await retrieveXref(doc);
  // console.timeEnd("xref");
  // console.time("get prim");
  // const prim = await getPrim("/Trailer/Root/Names/Dests/Names/1", doc);
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
  // console.time("string");
  // const string = await getStreamAsString("/Page2/Contents/0/Data", doc);
  // console.timeEnd("string");
  // console.log(string);
  // console.time("image");
  // // const image = await getStreamAsImage("/Page2/Contents/2/Data", doc);
  // const blob = await getImageAsBlob(
  //   "/Page2/Resources/XObject/Im0/Data",
  //   doc
  // );
  // console.timeEnd("image");
  // console.log(blob);
  // saveBlobToFile(blob, "image.png");
}

async function saveBlobToFile(blob, imagePath) {
  const buffer = await blobToBuffer(blob);

  fs.writeFile(imagePath, buffer, err => {
    if (err) {
      console.error("Error saving file:", err);
    } else {
      console.log("File saved successfully!");
    }
  });
}

function blobToBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(Buffer.from(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
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
