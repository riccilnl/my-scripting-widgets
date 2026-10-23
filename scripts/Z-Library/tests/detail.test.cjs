const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

let hooks = [];
let index = 0;
let sharedPath = "";
const downloadCalls = [];
const api = {
  details: async b => b,
  formats: async b => [b],
  preferredFormat: books => books[0],
  download: async book => {
    downloadCalls.push(book.id);
    return "/Documents/Z-Library/Book.epub";
  },
};

const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  if (name === "scripting") {
    const components = ["ScrollView","VStack","HStack","Spacer","Text","Image","Button"];
    const result = Object.fromEntries(components.map(x => [x,x]));
    result.useState = initial => {
      const current = index++;
      if (!(current in hooks)) hooks[current] = initial;
      return [hooks[current], next => {
        hooks[current] = typeof next === "function" ? next(hooks[current]) : next;
      }];
    };
    result.useEffect = () => {};
    return result;
  }
  if (name === "./api" && parent?.filename.endsWith("/detail.js")) return api;
  return originalLoad.call(this,name,parent,main);
};
global.createElement = (type, props, ...children) => ({type,props:props||{},children:children.flat(Infinity)});
global.ShareSheet = {present: async values => { sharedPath=values[0]; return true; }};
const {BookDetails} = require(path.resolve(__dirname,".compiled/detail.js"));
Module._load = originalLoad;

function render(book) {
  index=0;
  return BookDetails({book});
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree,...(tree.children||[]).flatMap(nodes)];
}
function action(tree) {
  return nodes(tree).filter(x => x.type === "Button" && /^(下载 |正在下载|分享或另存文件)/.test(x.props.title||""));
}
const book={id:"101",hash:"abc",title:"Book",author:"Author",extension:"EPUB",description:"Description",cover:"https://example.org/cover.png"};

test("detail adopts full-width layout before download and after status update", async () => {
  hooks=[];downloadCalls.length=0;
  let view=render(book);
  const elements=nodes(view);
  const scroll=elements.find(x=>x.type==="ScrollView");
  const root=elements.find(x=>x.type==="VStack");
  const hero=elements.find(x=>x.type==="HStack");
  assert.equal(scroll.props.frame.maxWidth,"infinity");
  assert.equal(scroll.props.frame.alignment,"leading");
  assert.equal(root.props.frame.maxWidth,"infinity");
  assert.equal(root.props.frame.alignment,"leading");
  assert.equal(hero.props.frame.maxWidth,"infinity");
  assert.equal(hero.props.frame.alignment,"leading");
  assert.equal(action(view).length,1);
  assert.equal(action(view)[0].props.title,"下载 EPUB");
  const button=action(view)[0];
  button.props.action();
  await new Promise(resolve=>setImmediate(resolve));
  view=render(book);
  assert.equal(action(view).length,1);
  assert.equal(action(view)[0].props.title,"分享或另存文件");
  assert.equal(nodes(view).find(x=>x.type==="VStack").props.frame.maxWidth,"infinity");
  assert.equal(nodes(view).find(x=>x.type==="VStack").props.frame.alignment,"leading");
  assert.deepEqual(downloadCalls,["101"]);
  action(view)[0].props.action();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sharedPath,"/Documents/Z-Library/Book.epub");
});

test("every expanded-width detail section must explicitly align to the leading edge", () => {
  hooks=[];
  const view=render(book);
  const expanded=nodes(view).filter(n => n.props?.frame?.maxWidth==="infinity");
  assert.equal(expanded.length,7);
  for (const node of expanded) assert.equal(node.props.frame.alignment,"leading");
});

test("detail introduction stays five lines and covers fit", () => {
  const view=render(book);
  const elements=nodes(view);
  assert.ok(elements.some(x=>x.type==="Text" && x.props.lineLimit===5));
  const cover=elements.find(x=>x.type==="Image");
  assert.equal(cover.props.aspectRatio.contentMode,"fit");
});
