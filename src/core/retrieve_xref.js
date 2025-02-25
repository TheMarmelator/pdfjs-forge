import {Dict, Ref} from "./primitives.js";
import {BaseStream} from "./base_stream.js";

async function retrieveXref(doc) {
  let result = new XRefTable(doc.xref.entries.length);
  for (let i = 0; i < doc.xref.entries.length; i++) {
    result.entries.push(to_model(i, doc.xref.entries[i], doc.xref));
  }
  return result;
}

function to_model(i, entry, xref) {
  if (entry.free) {
    return new XRefEntry("Free", i, entry.gen, entry.offset);
  }
  const fetched = xref.fetch(new Ref(i, entry.gen));
  let type = "Unknown";
  if (fetched instanceof Dict) {
    type = "Dictionary";
  } else if (fetched instanceof BaseStream) {
    type = "Stream";
  }
  return new XRefEntry(type, i, entry.gen, entry.offset);
}

class XRefTable {
  constructor(size) {
    this.size = size;
    this.entries = [];
  }
}

class XRefEntry {
  constructor(obj_type, obj_num, gen_num, offset) {
    this.obj_type = obj_type;
    this.obj_num = obj_num;
    this.gen_num = gen_num;
    this.offset = offset;
  }
}

export { XRefEntry, XRefTable, retrieveXref };
