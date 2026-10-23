const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const root = path.resolve(__dirname, "..");
let theme = "dark";
let effects = [];
let calls = [];
const originalLoad = Module._load;
const tags = [
  "NavigationStack", "NavigationLink", "ScrollView", "VStack", "HStack", "Spacer",
  "Text", "Button", "TextField", "Image", "Menu", "Divider"
];
const scripting = {
  ...Object.fromEntries(tags.map(tag=>[tag,tag])),
  useState: initial => [initial,()=>{}],
  useEffect: fn => effects.push(fn),
  useRef: initial => ({current:initial}),
  useColorScheme: () => theme
};
global.Storage = {get:()=>null,set:()=>true,remove:()=>{}};
global.createElement = (type,props,...children) =>
  ({type,props:props||{},children:children.flat(Infinity)});
Module._load = function(name,parent,main) {
  if(name==="scripting") return scripting;
  if(name==="./api" && parent?.filename.endsWith("/catalog.js")) return {
    cachedRecent:()=>null,recent:async()=>({books:[],total:0}),
    search:async (...args)=>{calls.push(args);return {books:[],total:0}}
  };
  if(name==="./results" && parent?.filename.endsWith("/catalog.js"))
    return {Results:() => null};
  return originalLoad.call(this,name,parent,main);
};
const catalog = require(path.resolve(root,"tests/.compiled/catalog.js"));
Module._load = originalLoad;

function flatten(tree) {
  if(tree==null||typeof tree!=="object")return [];
  return [tree,...(tree.children||[]).flatMap(flatten)];
}
test("search root only contains a scrollable form; search results open as a secondary destination",()=>{
  effects=[];calls=[];
  const tree=catalog.SearchPage();
  assert.equal(tree.type,"NavigationStack");
  const items=flatten(tree);
  const scroll=items.find(x=>x.type==="ScrollView");
  assert.ok(scroll);
  assert.equal(scroll.props.scrollDismissesKeyboard,"interactively");
  const link=items.find(x=>x.type==="NavigationLink");
  assert.ok(link);
  assert.equal(link.props.disabled,false,"blank keyword must never disable search");
  assert.equal(link.props.containerRelativeFrame.count,2,"button is half width");
  assert.equal(link.props.destination.type,catalog.SearchResultsPage);
  assert.equal(link.props.destination.props.criteria.query,"");
  assert.ok(!items.some(x=>x.type==="Results"),"results must not render on the form");
  const remember=items.find(x=>x.type==="Button"&&x.props.title==="记住搜索偏好");
  assert.ok(remember);
  assert.ok(!items.some(x=>x.type==="GeometryReader"),"no keyboard-sensitive geometry reader");
});

test("secondary results initiate an empty-keyword search on entry",async()=>{
  calls=[];effects=[];
  const props={query:"",yearFrom:"2020",yearTo:"",language:"chinese",format:"epub",order:"date"};
  const results=catalog.SearchResultsPage({criteria:props});
  assert.equal(results.props.navigationTitle,"搜索结果");
  assert.equal(effects.length,1);
  effects[0]();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,[["",1,"chinese","epub","2020","","date"]]);
});

test("selector text and icon use high-contrast light/dark theme instead of fixed blue",()=>{
  // Render nested ChoiceMenu using its node function from the search form.
  for(const [mode,expected] of [["dark","white"],["light","black"]]){
    theme=mode;effects=[];
    const tree=catalog.SearchPage();
    const row=flatten(tree).find(node=>node.type?.name==="FilterRow");
    assert.ok(row);
    const rowElement=row.type(row.props);
    const selector=flatten(rowElement).find(node=>node.type?.name==="ChoiceMenu");
    assert.ok(selector);
    const menu=selector.type(selector.props);
    assert.equal(menu.type,"Menu");
    const ink=flatten(menu.props.label);
    assert.equal(ink.find(node=>node.type==="Text").props.foregroundStyle,expected);
    assert.equal(ink.find(node=>node.type==="Image").props.foregroundStyle,expected);
  }
});
