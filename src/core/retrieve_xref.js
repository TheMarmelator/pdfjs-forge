import { Ref } from "./primitives.js";
import { toType } from "./obj_walker.js";

async function retrieveXref(doc) {
  const result = new XRefTable(doc.xref.entries.length);
  for (let i = 0; i < doc.xref.entries.length; i++) {
    result.entries.push(to_model(i, doc.xref.entries[i], doc.xref));
  }
  return result;
}

function to_model(i, entry, xref) {
  if (entry.free) {
    return new XRefEntry("Free", i, entry.gen, entry.offset);
  }
  const fetched = xref.fetch(Ref.get(i, entry.gen));
  const [type] = toType(fetched);
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

export { retrieveXref, XRefEntry, XRefTable };
