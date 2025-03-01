import { Dict, Name, Ref } from "./primitives.js";
import { BaseStream } from "./base_stream.js";
import { LocalColorSpaceCache } from "./image_utils.js";
import { PDFFunctionFactory } from "./function.js";
import { PDFImage } from "./image.js";

async function getPrim(path, doc) {
  const [prim, trace] = await getPrimitive(path, doc);
  return toModel(trace.at(-1).key, trace, prim);
}

async function getStreamAsString(path, doc) {
  if (!path.endsWith("Data")) {
    throw new Error(`Path ${path} does not end with Data!`);
  }
  const [prim] = await getPrimitive(path.replace("/Data", ""), doc);
  if ((!prim) instanceof BaseStream) {
    throw new Error(`Selected primitive with path ${path} is not a Stream!`);
  }
  const bytes = prim.getBytes();
  let string = "";
  for (let i = 0; i < bytes.length; i++) {
    string += String.fromCharCode(bytes[i]);
  }
  return string;
}

async function getImageAsBlob(path, doc) {
  if (!path.endsWith("Data")) {
    throw new Error(`Path ${path} does not end with Data!`);
  }
  const [prim] = await getPrimitive(path.replace("/Data", ""), doc);
  if ((!prim) instanceof BaseStream) {
    throw new Error(`Selected primitive with path ${path} is not a Stream!`);
  }
  const info = prim.dict;
  if (!info || info.getRaw("Subtype")?.name !== "Image") {
    throw new Error(`Selected Stream is not an Image!"`);
  }
  const pdfFunctionFactory = new PDFFunctionFactory({
    xref: doc.xref,
    isEvalSupported: true,
  });
  const pdfImage = new PDFImage({
    xref: doc.xref,
    image: prim,
    pdfFunctionFactory,
    localColorSpaceCache: new LocalColorSpaceCache(),
  });
  const imageData = await pdfImage.createImageData(true, false);
  return new Blob([imageData.data], { type: "image/png" });
}

async function getPrimitive(path, doc) {
  const xref = doc.xref;
  let path_arr = parsePath(path);
  let [prim, trace] = await getRoot(path_arr[0], doc);
  while (path_arr.length > 1) {
    path_arr = path_arr.slice(1);
    [prim, trace] = resolveStep(xref, prim, trace, path_arr[0]);
  }
  return [prim, trace];
}

async function getPrimTree(request, doc) {
  let results = [];
  for (const item of request) {
    results = results.concat(await _getPrimTree(item, doc));
  }
  return results;
}

async function _getPrimTree(request, doc) {
  const results = [];
  const [prim, trace] = await getRoot(request.key, doc);
  const root = toModel(request.key, trace, prim);
  results.push(toTreeModel(root, 0, true));
  addChildren(root, request, results, prim, doc, trace, 1);
  return results;
}

function addChildren(model, request, results, prim, doc, trace, depth) {
  for (const child of model.children) {
    const childRequest = request.children?.find(c => c.key === child.key);
    if (childRequest) {
      results.push(toTreeModel(child, depth, true));
      expandPrim(results, prim, childRequest, doc, trace, depth + 1);
    } else {
      results.push(toTreeModel(child, depth, false));
    }
  }
}

function expandPrim(results, rootPrim, request, doc, trace, depth) {
  if (depth > 20) {
    throw new Error(`Depth limit exceeded: ${depth}`);
  }
  const [prim, _trace] = resolveStep(doc.xref, rootPrim, trace, request.key);
  const model = toModel(request.key, _trace, prim);
  addChildren(model, request, results, prim, doc, _trace, depth);
}

function toTreeModel(primModel, depth, expand) {
  return new TreeViewModel(
    depth,
    primModel.key,
    primModel.ptype,
    primModel.sub_type,
    primModel.value,
    primModel.container,
    expand,
    primModel.trace
  );
}

function isContainer(prim) {
  return (
    prim instanceof Dict || Array.isArray(prim) || isRef(prim) || isStream(prim)
  );
}

async function getRoot(first, doc) {
  let root;
  const trace = [];
  if (first === "Trailer") {
    root = doc.xref.trailer;
    trace.push({ key: first, last_jump: first });
  } else if (first.startsWith("Page")) {
    const page = await doc.getPage(+first.replace("Page", "") - 1);
    const ref = page.ref;
    root = doc.xref.fetch(ref);
    trace.push({ key: first, last_jump: ref.num });
  } else {
    const ref = Ref.get(+first, 0);
    root = doc.xref.fetch(ref);
    trace.push({ key: first, last_jump: ref.num });
  }
  return [root, trace];
}

function parsePath(path) {
  if (Array.isArray(path)) {
    return path;
  }
  if (path.length === 0) {
    return [];
  }
  return path.split("/").filter(x => x !== "");
}

function isRef(obj) {
  return obj instanceof Ref;
}

function resolveStep(xref, root, trace, step) {
  let prim;
  const last_jump = trace.at(-1).last_jump;
  if (root instanceof Dict) {
    prim = root.getRaw(step);
  } else if (Array.isArray(root)) {
    const _step = +step;
    if (isNaN(_step) || _step >= root.length || _step < 0) {
      throw new Error(
        `Invalid step ${step} for Array of length: ${root.length}`
      );
    }
    prim = root[_step];
  } else if (root instanceof BaseStream && root.dict) {
    prim = root.dict.getRaw(step);
  } else {
    throw new Error(
      `Unexpected step ${step} at trace: /${trace.map(t => t.key).join("/")}`
    );
  }
  const _trace = copy(trace);
  if (isRef(prim)) {
    const num = prim.num;
    prim = xref.fetch(prim);
    _trace.push({ key: step, last_jump: num });
  } else {
    _trace.push({ key: step, last_jump });
  }
  return [prim, _trace];
}

function toModel(name, trace, prim) {
  const [type, subType] = toType(prim);
  let value = primToString(prim);
  const children = [];
  if (prim instanceof Dict) {
    value = format_dict_content(prim);
    const keys = prim.getKeys();
    const last = trace.at(-1);
    keys.forEach(child => {
      const _trace = copy(trace);
      _trace.push({ key: child, last_jump: last.last_jump });
      children.push(toModel(child, _trace, prim.getRaw(child)));
    });
  } else if (Array.isArray(prim)) {
    value = format_arr_content(prim);
    const last = trace.at(-1);
    for (let i = 0; i < prim.length; i++) {
      const _trace = copy(trace);
      _trace.push({ key: i.toString(), last_jump: last.last_jump });
      children.push(toModel(i.toString(), _trace, prim[i]));
    }
  } else if (isStream(prim)) {
    const info_dict = prim.dict;
    if (info_dict) {
      value = format_dict_content(info_dict);
      const keys = info_dict.getKeys();
      const last = trace.at(-1);
      keys.forEach(child => {
        const _trace = copy(trace);
        _trace.push({ key: child, last_jump: last.last_jump });
        children.push(toModel(child, _trace, info_dict.getRaw(child)));
      });
      const _trace = copy(trace);
      _trace.push({ key: "Data", last_jump: last.last_jump });
      children.push(
        new PrimitiveModel("Data", "-", "-", "Stream Data", false, [], _trace)
      );
    }
  }
  return new PrimitiveModel(
    name,
    type,
    subType,
    value,
    isContainer(prim),
    children,
    trace
  );
}

function toType(prim) {
  if (prim instanceof Dict) {
    const subType = prim.getRaw("Type");
    return ["Dictionary", subType ? subType.name : "-"];
  } else if (Array.isArray(prim)) {
    return ["Array", "-"];
  } else if (isStream(prim)) {
    const subType = prim.dict?.getRaw("Subtype");
    return ["Stream", subType ? subType.name : "-"];
  } else if (prim instanceof Name) {
    return ["Name", "-"];
  } else if (isInt(prim)) {
    return ["Integer", "-"];
  } else if (isNum(prim)) {
    return ["Number", "-"];
  } else if (isBool(prim)) {
    return ["Boolean", "-"];
  } else if (isString(prim)) {
    return ["String", "-"];
  } else if (isRef(prim)) {
    return ["Reference", "-"];
  }
  throw new Error("Unknown prim");
}

function copy(trace) {
  const _trace = [];
  for (let i = 0; i < trace.length; i++) {
    _trace.push(trace[i]);
  }
  return _trace;
}

function isBool(v) {
  return typeof v === "boolean";
}

function isInt(v) {
  return typeof v === "number" && (v | 0) === v;
}

function isNum(v) {
  return typeof v === "number";
}

function isString(v) {
  return typeof v === "string";
}

function isStream(v) {
  return v instanceof BaseStream;
}

function primToString(prim) {
  if (prim instanceof Dict) {
    return "Dictionary";
  } else if (Array.isArray(prim)) {
    return "Array";
  } else if (isStream(prim)) {
    return "Stream";
  } else if (prim instanceof Name) {
    return prim.name;
  } else if (isInt(prim)) {
    return prim.toString();
  } else if (isNum(prim)) {
    return prim.toString();
  } else if (isBool(prim)) {
    return prim.toString();
  } else if (isString(prim)) {
    return prim;
  } else if (isRef(prim)) {
    return "XRef(" + prim.num + ", " + prim.gen + ")";
  }
  throw new Error("Unknown prim");
}

function format_dict_content(dict) {
  let result = "{";
  const keys = dict.getKeys();
  result += keys
    .slice(0, 4)
    .map(key => key + ": " + primToString(dict.getRaw(key)))
    .join(", ");
  if (keys.length > 4) {
    result += ",...";
  }
  result += "}";
  return result;
}

function format_arr_content(arr) {
  let result = "[";
  result += arr
    .slice(0, 4)
    .map(p => primToString(p))
    .join(", ");
  if (arr.length > 4) {
    result += ",...";
  }
  result += "]";
  return result;
}

class PrimitiveModel {
  constructor(
    key,
    ptype,
    sub_type,
    value,
    container,
    children = [],
    trace = []
  ) {
    this.key = key;
    this.ptype = ptype;
    this.sub_type = sub_type;
    this.value = value;
    this.children = children;
    this.trace = trace;
    this.container = container;
  }
}

class TreeViewModel {
  constructor(depth, key, ptype, sub_type, value, container, expanded, trace) {
    this.depth = depth;
    this.key = key;
    this.ptype = ptype;
    this.sub_type = sub_type;
    this.value = value;
    this.container = container;
    this.expanded = expanded;
    this.trace = trace;
  }
}

export {
  getImageAsBlob,
  getPrim,
  getPrimitive,
  getPrimTree,
  getStreamAsString,
  PrimitiveModel,
  TreeViewModel,
};
