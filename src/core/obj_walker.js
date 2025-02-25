import {isDict, isName, Ref} from "./primitives.js";
import {BaseStream} from "./base_stream.js";
import {PDFImage} from "./image.js";
import {PartialEvaluator} from "./evaluator.js";
import {OperatorList} from "./operator_list.js";
import {LocalColorSpaceCache} from "./image_utils.js";

async function getPrim(path, doc) {
  const [prim, trace] = await getPrimitive(path, doc);
  return toModel(trace[trace.length - 1].key, trace, prim);
}

async function getStreamAsString(path, doc) {
  if (!path.endsWith("Data")) {
    throw new Error(`Path ${path} does not end with Data!`);
  }
  const [prim, trace] = await getPrimitive(path.replace("/Data", ""), doc);
  if ((!prim) instanceof BaseStream) {
    throw new Error(`Selected primitive with path ${path} is not a Stream!`);
  }
  const bytes = prim.getBytes();
  var string = "";
  for (var i = 0; i < bytes.length; i++) {
    string += String.fromCharCode(bytes[i]);
  }
  return string;
}

async function getStreamAsImage(path, doc) {
  if (!path.endsWith("Data")) {
    throw new Error(`Path ${path} does not end with Data!`);
  }
  const [prim, trace] = await getPrimitive(path.replace("/Data", ""), doc);
  if ((!prim) instanceof BaseStream) {
    throw new Error(`Selected primitive with path ${path} is not a Stream!`);
  }
  const info = prim.dict;
  if (!info || info.getRaw("Subtype")?.name !== "Image") {
    throw new Error(`Selected Stream is not an Image!"`);
  }
  const page = await doc.getPage(1);
  const evaluator = new PartialEvaluator({
    xref: doc.xref,
    handler: {sendWithPromise: undefined},
    pageIndex: 1,
    idFactory: page._localIdFactory,
  })
  const operatorList = new OperatorList();
  await evaluator.buildPaintImageXObject({
    resources: [],
    image: prim,
    operatorList,
    localImageCache: doc.catalog.globalImageCache,
    localColorSpaceCache: new LocalColorSpaceCache(),
  })
  return operatorList.;
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
  let results = [];
  let [prim, trace] = await getRoot(request.key, doc);
  const root = toModel(request.key, trace, prim);
  results.push(toTreeModel(root, 0, true));
  addChildren(root, request, results, prim, doc, trace, 1);
  return results;
}

function addChildren(model, request, results, prim, doc, trace, depth) {
  for (const child of model.children) {
    let childRequest = request.children?.find(c => c.key === child.key);
    if (childRequest) {
      results.push(toTreeModel(child, depth, true));
      expand(results, prim, childRequest, doc, trace, depth + 1);
    } else {
      results.push(toTreeModel(child, depth, false));
    }
  }
}

function expand(results, rootPrim, request, doc, trace, depth) {
  if (depth > 20) {
    throw new Error(`Depth limit exceeded: ${depth}`);
  }
  let [prim, _trace] = resolveStep(doc.xref, rootPrim, trace, request.key);
  const model = toModel(request.key, trace, prim);
  addChildren(model, request, results, prim, doc, trace, depth);
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
  return isDict(prim) || Array.isArray(prim) || isRef(prim) || isStream(prim);
}

async function getRoot(first, doc) {
  let root;
  let trace = [];
  if (first === "Trailer") {
    root = doc.xref.trailer;
    trace.push({key: first, last_jump: first});
  } else if (first.startsWith("Page")) {
    const page = await doc.getPage(+first.replace("Page", "") - 1);
    const ref = page.ref;
    root = doc.xref.fetch(ref);
    trace.push({key: first, last_jump: ref.num});
  } else {
    const ref = new Ref(+first, 0);
    root = doc.xref.fetch(ref);
    trace.push({key: first, last_jump: ref.num});
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
  let last_jump = trace[trace.length - 1].last_jump;
  if (isDict(root)) {
    prim = root.getRaw(step);
  } else if (Array.isArray(root)) {
    const _step = +step;
    if (isNaN(_step) || _step >= root.length || _step < 0) {
      throw new Error(
        `Invalid step ${step} for Array of length: ${root.length}`
      );
    }
    prim = root[_step];
  } else {
    throw new Error(
      `Unexpected step ${step} at trace: /${trace.map(t => t.key).join("/")}`
    );
  }
  let _trace = copy(trace);
  if (isRef(prim)) {
    const num = prim.num;
    prim = xref.fetch(prim);
    _trace.push({key: step, last_jump: num});
  } else {
    _trace.push({key: step, last_jump: last_jump});
  }
  return [prim, _trace];
}

function toModel(name, trace, prim) {
  const [type, subType] = toType(prim);
  var value = primToString(prim);
  var children = [];
  if (isDict(prim)) {
    value = format_dict_content(prim);
    const keys = prim.getKeys();
    const last = trace[trace.length - 1];
    keys.forEach(child => {
      let _trace = copy(trace);
      _trace.push({key: child, last_jump: last.last_jump});
      children.push(toModel(child, _trace, prim.getRaw(child)));
    });
  } else if (Array.isArray(prim)) {
    value = format_arr_content(prim);
    const last = trace[trace.length - 1];
    for (let i = 0; i < prim.length; i++) {
      let _trace = copy(trace);
      _trace.push({key: i.toString(), last_jump: last.last_jump});
      children.push(toModel(i.toString(), _trace, prim[i]));
    }
  } else if (isStream(prim)) {
    const info_dict = prim.dict;
    if (info_dict) {
      value = format_dict_content(info_dict);
      const keys = info_dict.getKeys();
      const last = trace[trace.length - 1];
      keys.forEach(child => {
        let _trace = copy(trace);
        _trace.push({key: child, last_jump: last.last_jump});
        children.push(toModel(child, _trace, info_dict.getRaw(child)));
      });
      let _trace = copy(trace);
      _trace.push({key: "Data", last_jump: last.last_jump});
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
  if (isDict(prim)) {
    const subType = prim.getRaw("Type");
    return ["Dictionary", subType ? subType.name : "-"];
  } else if (Array.isArray(prim)) {
    return ["Array", "-"];
  } else if (isStream(prim)) {
    const subType = prim.dict?.getRaw("Subtype");
    return ["Stream", subType ? subType.name : "-"];
  } else if (isName(prim)) {
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
  } else {
    console.log(prim);
    throw new Error("Unknown prim");
  }
}

function copy(trace) {
  var _trace = [];
  for (let i = 0; i < trace.length; i++) {
    _trace.push(trace[i]);
  }
  return _trace;
}

function isBool(v) {
  return typeof v == "boolean";
}

function isInt(v) {
  return typeof v == "number" && (v | 0) == v;
}

function isNum(v) {
  return typeof v == "number";
}

function isString(v) {
  return typeof v == "string";
}

function isStream(v) {
  return v instanceof BaseStream;
}

function primToString(prim) {
  if (isDict(prim)) {
    return "Dictionary";
  } else if (Array.isArray(prim)) {
    return "Array";
  } else if (isStream(prim)) {
    return "Stream";
  } else if (isName(prim)) {
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
  } else {
    console.log(prim);
    throw new Error("Unknown prim");
  }
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
  getPrim,
  getPrimTree,
  getPrimitive,
  getStreamAsString,
  getStreamAsImage,
  PrimitiveModel,
  TreeViewModel,
};
