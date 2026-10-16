import { Navigation, Script, WebView } from "scripting"

const Runtime: any = globalThis as any

/*
 * ASCIIFlow for Scripting
 * Source product reference: https://github.com/lewish/asciiflow (MIT)
 * This Scripting port keeps the open-source product's grid/entity workflow,
 * while using a compact touch-first renderer and Scripting-native bridges.
 */

const STORAGE_KEY = "asciiflow_scripting_state_v1"

const APP_HTML = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
<title>ASCIIFlow</title>
<style>
:root{
  color-scheme:light dark;
  --bg:#f7f7f8;--panel:rgba(255,255,255,.94);--panel2:#fff;--text:#18181b;--muted:#71717a;
  --line:#dedee3;--accent:#2563eb;--accent2:#dbeafe;--danger:#dc2626;--canvas:#fff;--grid:#eef0f3;
  --shadow:0 8px 30px rgba(0,0,0,.12);
}
@media(prefers-color-scheme:dark){:root{
  --bg:#111214;--panel:rgba(28,29,32,.96);--panel2:#1c1d20;--text:#f5f5f5;--muted:#a1a1aa;
  --line:#3a3b40;--accent:#60a5fa;--accent2:#172554;--danger:#f87171;--canvas:#151619;--grid:#24262b;
  --shadow:0 8px 30px rgba(0,0,0,.35);
}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--bg);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC",sans-serif;color:var(--text)}
button,input,textarea{font:inherit;color:inherit}
button{border:0;background:none}
#app{position:fixed;inset:0;display:flex;flex-direction:column;overflow:hidden}
.topbar{height:calc(50px + env(safe-area-inset-top));padding-top:env(safe-area-inset-top);display:flex;align-items:center;gap:6px;padding-left:10px;padding-right:8px;border-bottom:1px solid var(--line);background:var(--panel);backdrop-filter:blur(18px);z-index:20}
.brand{font-weight:750;letter-spacing:-.3px;font-size:17px;margin-right:auto;white-space:nowrap}.brand small{display:block;font-size:9px;color:var(--muted);font-weight:600;letter-spacing:.1px;margin-top:-2px}
.iconbtn{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;font-size:17px}.iconbtn:active{background:var(--accent2)}.iconbtn[disabled]{opacity:.3}
.canvaswrap{position:relative;flex:1;min-height:0;background:var(--canvas);overflow:hidden;touch-action:none}
#canvas{width:100%;height:100%;display:block;touch-action:none;cursor:crosshair}
.modepill{position:absolute;top:10px;left:10px;padding:6px 9px;border-radius:999px;background:var(--panel);box-shadow:var(--shadow);font-size:11px;color:var(--muted);pointer-events:none}
.zoom{position:absolute;right:10px;bottom:12px;display:flex;flex-direction:column;gap:6px;z-index:5}.zoom button{width:38px;height:38px;border-radius:12px;background:var(--panel);box-shadow:var(--shadow);font-size:18px}.zoom .fit{font-size:12px;font-weight:700}
.toolbar{height:calc(66px + env(safe-area-inset-bottom));padding:6px 8px env(safe-area-inset-bottom);display:flex;gap:6px;overflow-x:auto;border-top:1px solid var(--line);background:var(--panel);backdrop-filter:blur(18px);z-index:20;scrollbar-width:none}.toolbar::-webkit-scrollbar{display:none}
.tool{flex:0 0 58px;height:54px;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:var(--muted)}.tool .g{font:700 18px ui-monospace,SFMono-Regular,Menlo,monospace}.tool .t{font-size:10px}.tool.active{color:var(--accent);background:var(--accent2)}.tool:active{transform:scale(.96)}
.sheetback{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:50;display:none;align-items:flex-end}.sheetback.show{display:flex}.sheet{width:100%;max-height:82vh;background:var(--panel2);border-radius:18px 18px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom));box-shadow:var(--shadow);overflow:auto}.handle{width:36px;height:4px;border-radius:2px;background:var(--line);margin:0 auto 12px}.sheet h3{margin:0 0 10px;font-size:18px}.row{display:flex;gap:8px;align-items:center;margin:8px 0}.wide{flex:1;height:44px;border-radius:11px;background:var(--accent);color:white;font-weight:700}.secondary{background:var(--accent2);color:var(--accent)}.danger{background:#fee2e2;color:var(--danger)}
textarea{width:100%;min-height:260px;resize:vertical;border:1px solid var(--line);background:var(--canvas);border-radius:12px;padding:10px;font:13px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;outline:none}
.texteditor{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:60;display:none;align-items:center;justify-content:center;padding:18px}.texteditor.show{display:flex}.textcard{width:min(420px,100%);background:var(--panel2);border-radius:16px;padding:14px;box-shadow:var(--shadow)}.textcard textarea{min-height:120px;font-size:16px}.seg{display:flex;background:var(--bg);border-radius:10px;padding:3px;gap:2px}.seg button{flex:1;height:34px;border-radius:8px;font-size:12px}.seg button.on{background:var(--panel2);box-shadow:0 1px 4px rgba(0,0,0,.12);color:var(--accent);font-weight:700}
.toast{position:fixed;left:50%;bottom:calc(82px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(10px);background:rgba(24,24,27,.9);color:white;padding:8px 12px;border-radius:999px;font-size:12px;z-index:99;opacity:0;pointer-events:none;transition:.18s}.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.menurow{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding:11px 2px}.menurow:last-child{border-bottom:0}.menurow button{color:var(--accent);font-weight:650}.note{font-size:11px;color:var(--muted);line-height:1.4;margin-top:8px}
.contextmenu{position:fixed;z-index:80;display:none;min-width:150px;padding:6px;background:var(--panel2);border:1px solid var(--line);border-radius:13px;box-shadow:var(--shadow);backdrop-filter:blur(18px)}.contextmenu.show{display:block}.contextmenu button{width:100%;height:42px;padding:0 12px;text-align:left;border-radius:9px;font-weight:650}.contextmenu button:active:not(:disabled){background:var(--accent2)}.contextmenu button:disabled{opacity:.32}.contextmenu .danger{color:var(--danger)}
</style>
</head>
<body>
<div id="app">
  <div class="topbar">
    <button class="iconbtn" id="exitBtn" title="退出">✕</button>
    <div class="brand">ASCIIFlow<small>Scripting · Offline</small></div>
    <button class="iconbtn" id="undoBtn" title="撤销">↶</button>
    <button class="iconbtn" id="redoBtn" title="重做">↷</button>
    <button class="iconbtn" id="exportBtn" title="导出">⇧</button>
    <button class="iconbtn" id="moreBtn" title="更多">•••</button>
  </div>
  <div class="canvaswrap" id="canvasWrap">
    <canvas id="canvas"></canvas>
    <div class="modepill" id="modePill">选择 · 100%</div>
    <div class="zoom">
      <button id="zoomIn">＋</button><button id="zoomOut">−</button><button class="fit" id="fitBtn">适配</button>
    </div>
  </div>
  <div class="toolbar" id="toolbar">
    <button class="tool active" data-mode="select"><span class="g">↖</span><span class="t">选择</span></button>
    <button class="tool" data-mode="box"><span class="g">□</span><span class="t">矩形</span></button>
    <button class="tool" data-mode="ellipse"><span class="g">○</span><span class="t">圆形</span></button>
    <button class="tool" data-mode="line"><span class="g">└</span><span class="t">连线</span></button>
    <button class="tool" data-mode="arrow"><span class="g">→</span><span class="t">箭头</span></button>
    <button class="tool" data-mode="text"><span class="g">T</span><span class="t">文本</span></button>
    <button class="tool" data-mode="free"><span class="g">✎</span><span class="t">自由</span></button>
    <button class="tool" data-mode="erase"><span class="g">⌫</span><span class="t">擦除</span></button>
    <button class="tool" data-mode="pan"><span class="g">✥</span><span class="t">平移</span></button>
  </div>
</div>

<div class="sheetback" id="exportSheet"><div class="sheet"><div class="handle"></div><h3>导出 ASCII</h3><textarea id="exportText" spellcheck="false"></textarea><div class="row"><button class="wide secondary" id="closeExport">关闭</button><button class="wide" id="copyExport">复制</button></div></div></div>
<div class="sheetback" id="moreSheet"><div class="sheet"><div class="handle"></div><h3>更多</h3>
  <div class="menurow"><span>线框字符</span><div class="seg"><button id="unicodeBtn" class="on">Unicode</button><button id="asciiBtn">ASCII</button></div></div>
  <div class="menurow"><span>网格</span><div class="seg"><button id="gridOnBtn" class="on">显示</button><button id="gridOffBtn">隐藏</button></div></div>
  <div class="menurow"><span>从剪贴板导入</span><button id="importBtn">导入</button></div>
  <div class="menurow"><span>删除已选对象</span><button id="deleteBtn">删除</button></div>
  <div class="menurow"><span>清空画布</span><button id="clearBtn" style="color:var(--danger)">清空</button></div>
  <div class="note">数据自动保存在 Scripting 本地存储。几何图形需按下后拖动才会创建；选择对象后长按可锁定/解锁、复制或删除；复制后在空白画布长按可粘贴到目标位置。矩形和圆形可拖动 8 个控制点调整大小；线/箭头可拖动两端；双击已选文本可重新编辑。双指可缩放与平移。</div>
  <div class="row"><button class="wide secondary" id="closeMore">完成</button></div>
</div></div>
<div class="texteditor" id="textEditor"><div class="textcard"><h3 style="margin:0 0 10px">文本</h3><textarea id="textInput" spellcheck="false" placeholder="输入文本，可换行"></textarea><div class="row"><button class="wide secondary" id="textCancel">取消</button><button class="wide" id="textOK">完成</button></div></div></div>
<div class="contextmenu" id="entityMenu"><button id="lockBtn">锁定</button><button id="contextCopy">复制</button><button class="danger" id="contextDelete">删除</button></div>
<div class="contextmenu" id="canvasMenu"><button id="canvasPaste" disabled>粘贴</button></div>
<div class="toast" id="toast"></div>

<script>
(function(){
'use strict';
var canvas=document.getElementById('canvas'),wrap=document.getElementById('canvasWrap'),ctx=canvas.getContext('2d');
var CELL_W=16,CELL_H=16,FONT=14,MIN_Z=.45,MAX_Z=2.6,DRAW_THRESHOLD=10,LONG_PRESS_MS=520,LONG_PRESS_MOVE=8,EXPORT_X_SCALE=2;
var state={entities:[],selected:null,mode:'select',style:'unicode',grid:true,zoom:1,panX:36,panY:36};
var undoStack=[],redoStack=[],nextId=1,draft=null,gesture=null,pointers=new Map(),pinch=null,textPoint=null,saveTimer=null,eraseTouched=null,renderPending=false,committedRasterCache=null,committedRevision=0,baseLayer=document.createElement('canvas'),baseCtx=baseLayer.getContext('2d'),baseKey='',lastTapId=null,lastTapAt=0,longPressTimer=null,contextEntityId=null,entityClipboard=null,canvasPastePoint=null;
var modeNames={select:'选择',box:'矩形',ellipse:'圆形',line:'连线',arrow:'箭头',text:'文本',free:'自由绘制',erase:'擦除',pan:'平移'};
function byId(id){return document.getElementById(id)}
function toast(s){var e=byId('toast');e.textContent=s;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(function(){e.classList.remove('show')},1200)}
function cloneEntities(){return JSON.parse(JSON.stringify(state.entities))}
function snapshot(){return {entities:cloneEntities(),selected:state.selected,style:state.style,grid:state.grid}}
function sameSnap(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function pushUndo(before){var after=snapshot();if(!sameSnap(before,after)){undoStack.push(before);if(undoStack.length>80)undoStack.shift();redoStack=[];scheduleSave();updateButtons()}}
function invalidateCommitted(){committedRasterCache=null;committedRevision++;baseKey=''}
function requestRender(){if(renderPending)return;renderPending=true;requestAnimationFrame(function(){renderPending=false;render()})}
function restore(s){state.entities=JSON.parse(JSON.stringify(s.entities||[]));state.selected=s.selected||null;state.style=s.style||'unicode';state.grid=s.grid!==false;invalidateCommitted();syncStyleUI();scheduleSave();requestRender();updateButtons()}
function undo(){if(!undoStack.length)return;redoStack.push(snapshot());restore(undoStack.pop())}
function redo(){if(!redoStack.length)return;undoStack.push(snapshot());restore(redoStack.pop())}
function updateButtons(){byId('undoBtn').disabled=!undoStack.length;byId('redoBtn').disabled=!redoStack.length}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,220)}
function serializable(){return {version:1,entities:state.entities,selected:state.selected,style:state.style,grid:state.grid,zoom:state.zoom,panX:state.panX,panY:state.panY,nextId:nextId}}
async function saveNow(){clearTimeout(saveTimer);saveTimer=null;try{await window.webkit.messageHandlers.saveState.postMessage(JSON.stringify(serializable()))}catch(e){}}
async function flushSave(){clearTimeout(saveTimer);saveTimer=null;await saveNow()}
async function loadSaved(){try{var raw=await window.webkit.messageHandlers.loadState.postMessage(null);if(!raw)return;var s=JSON.parse(raw);if(Array.isArray(s.entities))state.entities=s.entities;for(var i=0;i<state.entities.length;i++)normalizeGeometry(state.entities[i]);if(s.style)state.style=s.style;if(typeof s.grid==='boolean')state.grid=s.grid;if(Number.isFinite(s.zoom))state.zoom=s.zoom;if(Number.isFinite(s.panX))state.panX=s.panX;if(Number.isFinite(s.panY))state.panY=s.panY;var maxId=0;for(var j=0;j<state.entities.length;j++){var id=Number(state.entities[j]&&state.entities[j].id);if(Number.isFinite(id))maxId=Math.max(maxId,Math.floor(id))}var savedNext=Number(s.nextId);nextId=Math.max(1,maxId+1,Number.isFinite(savedNext)?Math.floor(savedNext):1);if(state.selected!=null&&!state.entities.some(function(e){return e.id===state.selected}))state.selected=null;invalidateCommitted();syncStyleUI()}catch(e){}}
function newId(){return nextId++}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function sign(n){return n===0?0:(n>0?1:-1)}
function key(x,y){return x+','+y}
function addMask(map,x,y,m){var k=key(x,y);map.set(k,(map.get(k)||0)|m)}
var N=1,E=2,S=4,W=8;
function connect(map,a,b){var dx=b[0]-a[0],dy=b[1]-a[1];if(Math.abs(dx)+Math.abs(dy)!==1)return;if(dx===1){addMask(map,a[0],a[1],E);addMask(map,b[0],b[1],W)}else if(dx===-1){addMask(map,a[0],a[1],W);addMask(map,b[0],b[1],E)}else if(dy===1){addMask(map,a[0],a[1],S);addMask(map,b[0],b[1],N)}else{addMask(map,a[0],a[1],N);addMask(map,b[0],b[1],S)}}
function walkAxis(path,x1,y1,x2,y2){var x=x1,y=y1;if(!path.length)path.push([x,y]);while(x!==x2){x+=sign(x2-x);path.push([x,y])}while(y!==y2){y+=sign(y2-y);path.push([x,y])}}
function linePath(e){var x1=e.x1,y1=e.y1,x2=e.x2,y2=e.y2,p=[];if(x1===x2||y1===y2){walkAxis(p,x1,y1,x2,y2);return p}var dx=Math.abs(x2-x1),dy=Math.abs(y2-y1);if(dx>=dy){var mx=Math.round((x1+x2)/2);walkAxis(p,x1,y1,mx,y1);walkAxis(p,mx,y1,mx,y2);walkAxis(p,mx,y2,x2,y2)}else{var my=Math.round((y1+y2)/2);walkAxis(p,x1,y1,x1,my);walkAxis(p,x1,my,x2,my);walkAxis(p,x2,my,x2,y2)}return dedupePath(p)}
function dedupePath(p){var out=[];for(var i=0;i<p.length;i++){if(!out.length||out[out.length-1][0]!==p[i][0]||out[out.length-1][1]!==p[i][1])out.push(p[i])}return out}
function normalizeGeometry(e){if(!e||(e.type!=='box'&&e.type!=='ellipse'))return e;var dx=e.x2-e.x1,dy=e.y2-e.y1;if(Math.abs(dx)<2)e.x2=e.x1+(dx<0?-2:2);if(Math.abs(dy)<2)e.y2=e.y1+(dy<0?-2:2);return e}
function boxPath(e){var a=Math.min(e.x1,e.x2),b=Math.max(e.x1,e.x2),c=Math.min(e.y1,e.y2),d=Math.max(e.y1,e.y2),p=[];if(b-a<2)b=a+2;if(d-c<2)d=c+2;for(var x=a;x<=b;x++)p.push([x,c]);for(var y=c+1;y<=d;y++)p.push([b,y]);for(var x2=b-1;x2>=a;x2--)p.push([x2,d]);for(var y2=d-1;y2>c;y2--)p.push([a,y2]);p.push([a,c]);return p}
function walkManhattan(path,x1,y1,x2,y2){var x=x1,y=y1;if(!path.length)path.push([x,y]);while(x!==x2||y!==y2){var dx=Math.abs(x2-x),dy=Math.abs(y2-y);if(x!==x2&&(y===y2||dx>=dy))x+=sign(x2-x);else if(y!==y2)y+=sign(y2-y);path.push([x,y])}}
function ellipsePath(e){var a=Math.min(e.x1,e.x2),b=Math.max(e.x1,e.x2),c=Math.min(e.y1,e.y2),d=Math.max(e.y1,e.y2);if(b-a<2)b=a+2;if(d-c<2)d=c+2;var cx=(a+b)/2,cy=(c+d)/2,rx=Math.max(1,(b-a)/2),ry=Math.max(1,(d-c)/2),samples=Math.max(32,Math.ceil(Math.PI*2*Math.max(rx,ry)*5)),raw=[];for(var i=0;i<=samples;i++){var ang=(i/samples)*Math.PI*2,x=Math.round(cx+Math.cos(ang)*rx),y=Math.round(cy+Math.sin(ang)*ry);if(!raw.length||raw[raw.length-1][0]!==x||raw[raw.length-1][1]!==y)raw.push([x,y])}if(raw.length&& (raw[0][0]!==raw[raw.length-1][0]||raw[0][1]!==raw[raw.length-1][1]))raw.push(raw[0]);var p=[];for(var j=1;j<raw.length;j++)walkManhattan(p,raw[j-1][0],raw[j-1][1],raw[j][0],raw[j][1]);return dedupePath(p)}
function maskChar(m){if(state.style==='ascii'){if(m===N||m===S||m===(N|S))return '|';if(m===E||m===W||m===(E|W))return '-';return '+'}var t={};t[N]='│';t[S]='│';t[N|S]='│';t[E]='─';t[W]='─';t[E|W]='─';t[E|S]='┌';t[W|S]='┐';t[E|N]='└';t[W|N]='┘';t[N|S|E]='├';t[N|S|W]='┤';t[E|W|S]='┬';t[E|W|N]='┴';t[N|E|S|W]='┼';return t[m]||'+'}
function rasterizeEntities(ents){var conn=new Map(),overlay=new Map();for(var ei=0;ei<ents.length;ei++){var e=ents[ei];if(!e)continue;if(e.type==='box'||e.type==='ellipse'){var bp=e.type==='ellipse'?ellipsePath(e):boxPath(e);for(var i=1;i<bp.length;i++)connect(conn,bp[i-1],bp[i])}else if(e.type==='line'||e.type==='arrow'){var lp=linePath(e);for(var j=1;j<lp.length;j++)connect(conn,lp[j-1],lp[j]);if(e.type==='arrow'&&lp.length>1){var q=lp[lp.length-2],r=lp[lp.length-1],ch='>';if(r[0]<q[0])ch='<';else if(r[1]>q[1])ch=state.style==='unicode'?'▼':'v';else if(r[1]<q[1])ch=state.style==='unicode'?'▲':'^';else if(state.style==='unicode')ch='▶';overlay.set(key(r[0],r[1]),ch)}}else if(e.type==='text'){var lines=String(e.text||'').split('\n');for(var yy=0;yy<lines.length;yy++){var arr=Array.from(lines[yy]);for(var xx=0;xx<arr.length;xx++)if(arr[xx]!==' ')overlay.set(key(e.x+xx,e.y+yy),arr[xx])}}else if(e.type==='raw'){for(var ry=0;ry<e.lines.length;ry++){var ra=Array.from(e.lines[ry]);for(var rx=0;rx<ra.length;rx++)if(ra[rx]!==' ')overlay.set(key(e.x+rx,e.y+ry),ra[rx])}}else if(e.type==='free'){for(var fi=0;fi<e.points.length;fi++){var fp=e.points[fi];overlay.set(key(fp[0],fp[1]),state.style==='unicode'?'•':'*')}}}
var out=new Map();conn.forEach(function(m,k){out.set(k,maskChar(m))});overlay.forEach(function(ch,k){out.set(k,ch)});return out}
function rasterize(onlyEntity){if(onlyEntity)return rasterizeEntities([onlyEntity]);if(committedRasterCache)return committedRasterCache;committedRasterCache=rasterizeEntities(state.entities);return committedRasterCache}
function bounds(e){if(!e)return null;if(e.type==='box'||e.type==='ellipse'||e.type==='line'||e.type==='arrow')return {x1:Math.min(e.x1,e.x2),y1:Math.min(e.y1,e.y2),x2:Math.max(e.x1,e.x2),y2:Math.max(e.y1,e.y2)};if(e.type==='text'){var ls=String(e.text||'').split('\n'),mw=0;for(var i=0;i<ls.length;i++)mw=Math.max(mw,Array.from(ls[i]).length);return{x1:e.x,y1:e.y,x2:e.x+Math.max(0,mw-1),y2:e.y+Math.max(0,ls.length-1)}}if(e.type==='raw'){var mw2=0;for(var j=0;j<e.lines.length;j++)mw2=Math.max(mw2,Array.from(e.lines[j]).length);return{x1:e.x,y1:e.y,x2:e.x+Math.max(0,mw2-1),y2:e.y+Math.max(0,e.lines.length-1)}}if(e.type==='free'){if(!e.points.length)return{x1:0,y1:0,x2:0,y2:0};var xs=e.points.map(function(p){return p[0]}),ys=e.points.map(function(p){return p[1]});return{x1:Math.min.apply(null,xs),y1:Math.min.apply(null,ys),x2:Math.max.apply(null,xs),y2:Math.max.apply(null,ys)}}return null}
function hitEntity(x,y){for(var i=state.entities.length-1;i>=0;i--){var e=state.entities[i],b=bounds(e);if(!b)continue;if(e.type==='line'||e.type==='arrow'){var rm=rasterize(e);if(rm.has(key(x,y))||rm.has(key(x+1,y))||rm.has(key(x-1,y))||rm.has(key(x,y+1))||rm.has(key(x,y-1)))return e}else if(x>=b.x1&&x<=b.x2&&y>=b.y1&&y<=b.y2)return e}return null}
function pointSegDist(px,py,ax,ay,bx,by){var vx=bx-ax,vy=by-ay,wx=px-ax,wy=py-ay,c1=vx*wx+vy*wy;if(c1<=0)return Math.hypot(px-ax,py-ay);var c2=vx*vx+vy*vy;if(c2<=c1)return Math.hypot(px-bx,py-by);var t=c1/c2,qx=ax+t*vx,qy=ay+t*vy;return Math.hypot(px-qx,py-qy)}
function hitEntityAtScreen(p){var cw=CELL_W*state.zoom,ch=CELL_H*state.zoom,tol=Math.max(11,Math.min(cw,ch)*.62);function center(gx,gy){return{x:state.panX+gx*cw+cw/2,y:state.panY+gy*ch+ch/2}}for(var i=state.entities.length-1;i>=0;i--){var e=state.entities[i],b=bounds(e);if(!b)continue;if(e.type==='line'||e.type==='arrow'){var lp=linePath(e);for(var j=1;j<lp.length;j++){var a=center(lp[j-1][0],lp[j-1][1]),z=center(lp[j][0],lp[j][1]);if(pointSegDist(p.x,p.y,a.x,a.y,z.x,z.y)<=tol)return e}}else if(e.type==='ellipse'){var ecx=state.panX+((b.x1+b.x2+1)/2)*cw,ecy=state.panY+((b.y1+b.y2+1)/2)*ch,erx=Math.max(cw/2,((b.x2-b.x1+1)*cw)/2),ery=Math.max(ch/2,((b.y2-b.y1+1)*ch)/2),nx=(p.x-ecx)/erx,ny=(p.y-ecy)/ery;if(nx*nx+ny*ny<=1.18)return e}else if(e.type==='free'){for(var f=0;f<e.points.length;f++){var q=center(e.points[f][0],e.points[f][1]);if(Math.hypot(p.x-q.x,p.y-q.y)<=tol)return e}}else{var l=state.panX+b.x1*cw,t=state.panY+b.y1*ch,r=state.panX+(b.x2+1)*cw,bot=state.panY+(b.y2+1)*ch;if(p.x>=l-tol*.25&&p.x<=r+tol*.25&&p.y>=t-tol*.25&&p.y<=bot+tol*.25)return e}}return null}
function translateEntity(e,dx,dy){if(e.type==='box'||e.type==='ellipse'||e.type==='line'||e.type==='arrow'){e.x1+=dx;e.x2+=dx;e.y1+=dy;e.y2+=dy}else if(e.type==='text'||e.type==='raw'){e.x+=dx;e.y+=dy}else if(e.type==='free'){for(var i=0;i<e.points.length;i++){e.points[i][0]+=dx;e.points[i][1]+=dy}}invalidateCommitted()}
function removeEntity(id){var ix=state.entities.findIndex(function(e){return e.id===id});if(ix>=0){state.entities.splice(ix,1);invalidateCommitted()}if(state.selected===id)state.selected=null}
function selectedEntity(){return state.entities.find(function(e){return e.id===state.selected})||null}
function canvasPoint(ev){var r=canvas.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top}}
function gridPoint(ev){var p=canvasPoint(ev);return{x:Math.round((p.x-state.panX)/(CELL_W*state.zoom)),y:Math.round((p.y-state.panY)/(CELL_H*state.zoom))}}
function entityHandlePoints(e){if(!e||e.locked)return[];if(e.type==='line'||e.type==='arrow')return[{name:'start',x:e.x1,y:e.y1},{name:'end',x:e.x2,y:e.y2}];if(e.type!=='box'&&e.type!=='ellipse')return[];var b=bounds(e),mx=(b.x1+b.x2)/2,my=(b.y1+b.y2)/2;return[{name:'nw',x:b.x1,y:b.y1},{name:'n',x:mx,y:b.y1},{name:'ne',x:b.x2,y:b.y1},{name:'e',x:b.x2,y:my},{name:'se',x:b.x2,y:b.y2},{name:'s',x:mx,y:b.y2},{name:'sw',x:b.x1,y:b.y2},{name:'w',x:b.x1,y:my}]}
function handleScreenPoint(h){var cw=CELL_W*state.zoom,ch=CELL_H*state.zoom;return{x:state.panX+h.x*cw+cw/2,y:state.panY+h.y*ch+ch/2}}
function hitHandle(e,p){var hs=entityHandlePoints(e),radius=Math.max(15,12*state.zoom);for(var i=0;i<hs.length;i++){var sp=handleScreenPoint(hs[i]);if(Math.hypot(p.x-sp.x,p.y-sp.y)<=radius)return hs[i].name}return null}
function resizeBoxFromHandle(e,handle,g,origin){var nx1=origin.x1,ny1=origin.y1,nx2=origin.x2,ny2=origin.y2;if(handle.indexOf('w')>=0)nx1=Math.min(g.x,nx2-2);if(handle.indexOf('e')>=0)nx2=Math.max(g.x,nx1+2);if(handle.indexOf('n')>=0)ny1=Math.min(g.y,ny2-2);if(handle.indexOf('s')>=0)ny2=Math.max(g.y,ny1+2);e.x1=nx1;e.y1=ny1;e.x2=nx2;e.y2=ny2}
function resizeEntity(e,handle,g,origin){if(!e)return;if(e.type==='box'||e.type==='ellipse')resizeBoxFromHandle(e,handle,g,origin);else if(e.type==='line'||e.type==='arrow'){if(handle==='start'){e.x1=g.x;e.y1=g.y}else if(handle==='end'){e.x2=g.x;e.y2=g.y}}}
function resize(){var r=wrap.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.floor(r.width*dpr));canvas.height=Math.max(1,Math.floor(r.height*dpr));canvas.style.width=r.width+'px';canvas.style.height=r.height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);render()}
function css(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim()}
function render(){var r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1,z=state.zoom,cw=CELL_W*z,ch=CELL_H*z,canvasColor=css('--canvas'),gridColor=css('--grid'),textColor=css('--text'),accentColor=css('--accent');
function setupText(c){c.textAlign='center';c.textBaseline='middle';c.font=(FONT*z)+'px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace'}
function paintCellsOn(c,cells,color){c.fillStyle=color;var measured=Math.max(1,c.measureText('M').width),glyphScaleX=clamp((cw*.94)/measured,1,2.25);c.save();c.scale(glyphScaleX,1);cells.forEach(function(chv,k){var p=k.split(','),gx=+p[0],gy=+p[1],px=state.panX+gx*cw+cw/2,py=state.panY+gy*ch+ch/2;if(px>-cw&&px<r.width+cw&&py>-ch&&py<r.height+ch)c.fillText(chv,px/glyphScaleX,py)});c.restore()}
var cacheKey=[canvas.width,canvas.height,Math.round(z*10000),Math.round(state.panX*10),Math.round(state.panY*10),state.style,state.grid?1:0,committedRevision,canvasColor,gridColor,textColor].join('|');
if(baseKey!==cacheKey){if(baseLayer.width!==canvas.width)baseLayer.width=canvas.width;if(baseLayer.height!==canvas.height)baseLayer.height=canvas.height;baseCtx.setTransform(dpr,0,0,dpr,0,0);baseCtx.clearRect(0,0,r.width,r.height);baseCtx.fillStyle=canvasColor;baseCtx.fillRect(0,0,r.width,r.height);if(state.grid&&cw>5&&ch>5){baseCtx.strokeStyle=gridColor;baseCtx.lineWidth=1;baseCtx.beginPath();var sx=((state.panX%cw)+cw)%cw,sy=((state.panY%ch)+ch)%ch;for(var x=sx;x<r.width;x+=cw){baseCtx.moveTo(Math.round(x)+.5,0);baseCtx.lineTo(Math.round(x)+.5,r.height)}for(var y=sy;y<r.height;y+=ch){baseCtx.moveTo(0,Math.round(y)+.5);baseCtx.lineTo(r.width,Math.round(y)+.5)}baseCtx.stroke()}setupText(baseCtx);paintCellsOn(baseCtx,rasterize(),textColor);baseKey=cacheKey}
ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(baseLayer,0,0);ctx.restore();setupText(ctx);
function center(gx,gy){return{x:state.panX+gx*cw+cw/2,y:state.panY+gy*ch+ch/2}}
function drawDraftVector(e){if(!e)return;ctx.save();ctx.strokeStyle=accentColor;ctx.fillStyle=accentColor;ctx.globalAlpha=.95;ctx.lineWidth=Math.max(2,2*z);ctx.setLineDash([]);ctx.lineJoin='round';ctx.lineCap='round';if(e.type==='box'){var a=center(Math.min(e.x1,e.x2),Math.min(e.y1,e.y2)),b=center(Math.max(e.x1,e.x2),Math.max(e.y1,e.y2));ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y)}else if(e.type==='ellipse'){var eb=bounds(e),ec1=center(eb.x1,eb.y1),ec2=center(eb.x2,eb.y2),ecx=(ec1.x+ec2.x)/2,ecy=(ec1.y+ec2.y)/2,erx=Math.max(cw/2,Math.abs(ec2.x-ec1.x)/2),ery=Math.max(ch/2,Math.abs(ec2.y-ec1.y)/2);ctx.beginPath();ctx.ellipse(ecx,ecy,erx,ery,0,0,Math.PI*2);ctx.stroke()}else if(e.type==='line'||e.type==='arrow'){var lp=linePath(e);if(lp.length){ctx.beginPath();var p0=center(lp[0][0],lp[0][1]);ctx.moveTo(p0.x,p0.y);for(var i=1;i<lp.length;i++){var pi=center(lp[i][0],lp[i][1]);ctx.lineTo(pi.x,pi.y)}ctx.stroke();if(e.type==='arrow'&&lp.length>1){var qa=center(lp[lp.length-2][0],lp[lp.length-2][1]),ra=center(lp[lp.length-1][0],lp[lp.length-1][1]),ang=Math.atan2(ra.y-qa.y,ra.x-qa.x),asz=Math.max(7,7*z);ctx.beginPath();ctx.moveTo(ra.x,ra.y);ctx.lineTo(ra.x-Math.cos(ang-.55)*asz,ra.y-Math.sin(ang-.55)*asz);ctx.lineTo(ra.x-Math.cos(ang+.55)*asz,ra.y-Math.sin(ang+.55)*asz);ctx.closePath();ctx.fill()}}}else if(e.type==='free'&&e.points&&e.points.length){ctx.beginPath();var f0=center(e.points[0][0],e.points[0][1]);ctx.moveTo(f0.x,f0.y);for(var fi=1;fi<e.points.length;fi++){var fp=center(e.points[fi][0],e.points[fi][1]);ctx.lineTo(fp.x,fp.y)}ctx.stroke()}ctx.restore()}
if(draft){if(draft.type!=='free')paintCellsOn(ctx,rasterizeEntities([draft]),accentColor);drawDraftVector(draft)}
var se=selectedEntity();if(state.mode==='select'&&se){var b=bounds(se);ctx.strokeStyle=accentColor;ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.strokeRect(state.panX+b.x1*cw-3,state.panY+b.y1*ch-3,(b.x2-b.x1+1)*cw+6,(b.y2-b.y1+1)*ch+6);ctx.setLineDash([]);var hs=entityHandlePoints(se);for(var hi=0;hi<hs.length;hi++){var hp=handleScreenPoint(hs[hi]),rr=Math.max(5.5,5.5*z);ctx.beginPath();ctx.arc(hp.x,hp.y,rr,0,Math.PI*2);ctx.fillStyle=canvasColor;ctx.fill();ctx.lineWidth=Math.max(2,1.5*z);ctx.strokeStyle=accentColor;ctx.stroke()}}
byId('modePill').textContent=modeNames[state.mode]+' · '+Math.round(state.zoom*100)+'%'+(se&&se.locked?' · 已锁定':'');}
function setMode(m){cancelLongPress();closeEntityMenu();closeCanvasMenu();state.mode=m;document.querySelectorAll('.tool').forEach(function(b){b.classList.toggle('active',b.dataset.mode===m)});render()}
function syncStyleUI(){byId('unicodeBtn').classList.toggle('on',state.style==='unicode');byId('asciiBtn').classList.toggle('on',state.style==='ascii');byId('gridOnBtn').classList.toggle('on',state.grid);byId('gridOffBtn').classList.toggle('on',!state.grid)}
function zoomAt(factor,cx,cy){var old=state.zoom,nz=clamp(old*factor,MIN_Z,MAX_Z);if(nz===old)return;state.panX=cx-(cx-state.panX)*(nz/old);state.panY=cy-(cy-state.panY)*(nz/old);state.zoom=nz;scheduleSave();render()}
function fit(){if(!state.entities.length){state.zoom=1;state.panX=36;state.panY=36;render();scheduleSave();return}var bs=state.entities.map(bounds).filter(Boolean),minx=Math.min.apply(null,bs.map(function(b){return b.x1})),maxx=Math.max.apply(null,bs.map(function(b){return b.x2})),miny=Math.min.apply(null,bs.map(function(b){return b.y1})),maxy=Math.max.apply(null,bs.map(function(b){return b.y2})),r=canvas.getBoundingClientRect(),zw=(r.width-50)/((maxx-minx+1)*CELL_W),zh=(r.height-50)/((maxy-miny+1)*CELL_H);state.zoom=clamp(Math.min(zw,zh),MIN_Z,MAX_Z);state.panX=(r.width-(maxx-minx+1)*CELL_W*state.zoom)/2-minx*CELL_W*state.zoom;state.panY=(r.height-(maxy-miny+1)*CELL_H*state.zoom)/2-miny*CELL_H*state.zoom;render();scheduleSave()}
function openText(x,y,existing){textPoint={x:x,y:y,id:existing?existing.id:null};byId('textInput').value=existing?existing.text:'';byId('textEditor').classList.add('show');setTimeout(function(){byId('textInput').focus()},80)}
function closeText(){byId('textEditor').classList.remove('show');textPoint=null}
function commitText(){if(!textPoint)return;var val=byId('textInput').value,before=snapshot();if(textPoint.id){var e=state.entities.find(function(v){return v.id===textPoint.id});if(e){if(e.locked){toast('对象已锁定');closeText();return}if(val){e.text=val;invalidateCommitted()}else removeEntity(e.id)}}else if(val){var ne={id:newId(),type:'text',x:textPoint.x,y:textPoint.y,text:val};state.entities.push(ne);state.selected=ne.id;invalidateCommitted()}closeText();pushUndo(before);requestRender()}
function cancelLongPress(){if(longPressTimer){clearTimeout(longPressTimer);longPressTimer=null}}
function closeEntityMenu(){byId('entityMenu').classList.remove('show');contextEntityId=null}
function closeCanvasMenu(){byId('canvasMenu').classList.remove('show');canvasPastePoint=null}
function menuPosition(menu,p,minHeight){var cr=canvas.getBoundingClientRect(),px=cr.left+p.x,py=cr.top+p.y,mw=Math.max(160,menu.offsetWidth||160),mh=Math.max(42,menu.offsetHeight||minHeight||42),left=clamp(px+10,8,window.innerWidth-mw-8),top=clamp(py-28,8,window.innerHeight-mh-8);menu.style.left=left+'px';menu.style.top=top+'px'}
function openEntityMenu(e,p){cancelLongPress();if(!e)return;closeCanvasMenu();state.selected=e.id;contextEntityId=e.id;var menu=byId('entityMenu'),btn=byId('lockBtn');btn.textContent=e.locked?'解锁':'锁定';byId('contextDelete').disabled=!!e.locked;menu.classList.add('show');menuPosition(menu,p,134);gesture={type:'context'};requestRender()}
function gridFromCanvasPoint(p){return{x:Math.round((p.x-state.panX)/(CELL_W*state.zoom)),y:Math.round((p.y-state.panY)/(CELL_H*state.zoom))}}
function openCanvasMenu(p){cancelLongPress();closeEntityMenu();state.selected=null;canvasPastePoint=gridFromCanvasPoint(p);var menu=byId('canvasMenu');byId('canvasPaste').disabled=!entityClipboard;menu.classList.add('show');menuPosition(menu,p,54);gesture={type:'context'};requestRender()}
function armLongPress(e,p){cancelLongPress();if(!e)return;var sx=p.x,sy=p.y,id=e.id;longPressTimer=setTimeout(function(){var cur=state.entities.find(function(v){return v.id===id});if(!cur||!gesture)return;var gp=gesture.startPoint||p;if(Math.hypot(gp.x-sx,gp.y-sy)<=LONG_PRESS_MOVE)openEntityMenu(cur,p)},LONG_PRESS_MS)}
function armCanvasLongPress(p){cancelLongPress();var sx=p.x,sy=p.y;longPressTimer=setTimeout(function(){if(!gesture||gesture.type!=='canvasPending')return;var gp=gesture.startPoint||p;if(Math.hypot(gp.x-sx,gp.y-sy)<=LONG_PRESS_MOVE)openCanvasMenu(p)},LONG_PRESS_MS)}
function toggleContextLock(){var e=state.entities.find(function(v){return v.id===contextEntityId});if(!e)return closeEntityMenu();var before=snapshot();e.locked=!e.locked;pushUndo(before);closeEntityMenu();toast(e.locked?'已锁定':'已解锁');requestRender()}
function copyContextEntity(){var e=state.entities.find(function(v){return v.id===contextEntityId});if(!e)return closeEntityMenu();entityClipboard=JSON.parse(JSON.stringify(e));delete entityClipboard.id;closeEntityMenu();toast('已复制')}
function pasteCanvasEntity(){if(!entityClipboard){toast('没有可粘贴对象');return}var before=snapshot(),ne=JSON.parse(JSON.stringify(entityClipboard));ne.id=newId();ne.locked=false;normalizeGeometry(ne);var b=bounds(ne),target=canvasPastePoint||{x:0,y:0},cx=Math.round((b.x1+b.x2)/2),cy=Math.round((b.y1+b.y2)/2);translateEntity(ne,target.x-cx,target.y-cy);state.entities.push(ne);state.selected=ne.id;invalidateCommitted();pushUndo(before);closeCanvasMenu();toast('已粘贴');requestRender()}
function deleteContextEntity(){var e=state.entities.find(function(v){return v.id===contextEntityId});if(!e)return closeEntityMenu();if(e.locked){toast('对象已锁定');return}var before=snapshot();removeEntity(e.id);pushUndo(before);closeEntityMenu();toast('已删除');requestRender()}
function commitDraft(){if(!(gesture&&gesture.type==='draw'&&draft))return false;var finished=normalizeGeometry(draft),b=gesture.before;state.entities.push(finished);state.selected=null;invalidateCommitted();draft=null;gesture=null;pushUndo(b);requestRender();return true}
function finalizeStaleDraw(){cancelLongPress();if(gesture&&gesture.type==='draw'&&draft)commitDraft();else if(gesture&&gesture.type==='drawPending'){draft=null;gesture=null}}
function startPointer(ev){if(ev.pointerType==='mouse'&&typeof ev.button==='number'&&ev.button!==0)return;if(ev.isPrimary&&pointers.size&&gesture&&gesture.type==='draw'&&draft){commitDraft();pointers.clear();pinch=null}else if(pointers.size===0)finalizeStaleDraw();closeEntityMenu();closeCanvasMenu();pointers.set(ev.pointerId,canvasPoint(ev));if(pointers.size===2){cancelLongPress();finalizeStaleDraw();var ps=Array.from(pointers.values()),dx=ps[1].x-ps[0].x,dy=ps[1].y-ps[0].y;pinch={dist:Math.max(10,Math.hypot(dx,dy)),zoom:state.zoom,panX:state.panX,panY:state.panY,cx:(ps[0].x+ps[1].x)/2,cy:(ps[0].y+ps[1].y)/2};gesture=null;requestRender();return}if(pointers.size>1)return;var g=gridPoint(ev),p=canvasPoint(ev),before=snapshot();if(state.mode==='text'){var hit=hitEntity(g.x,g.y);if(hit&&hit.type==='text'&&hit.locked){state.selected=hit.id;toast('对象已锁定');requestRender();return}openText(g.x,g.y,hit&&hit.type==='text'?hit:null);return}if(state.mode==='pan'){gesture={type:'pan',sx:p.x,sy:p.y,px:state.panX,py:state.panY};return}if(state.mode==='select'){var current=selectedEntity(),h=hitEntityAtScreen(p),now=Date.now();if(h&&(!current||h.id!==current.id)){state.selected=h.id;lastTapId=h.id;lastTapAt=now;gesture={type:'selectPending',id:h.id,gx:g.x,gy:g.y,lastx:g.x,lasty:g.y,before:before,moved:false,startPoint:p};armLongPress(h,p);requestRender();return}var handle=current&&!current.locked?hitHandle(current,p):null;if(current&&handle){gesture={type:'resize',id:current.id,handle:handle,before:before,origin:bounds(current),moved:false,startPoint:p};requestRender();return}if(h&&h.type==='text'&&!h.locked&&state.selected===h.id&&lastTapId===h.id&&now-lastTapAt<420){gesture=null;lastTapId=null;lastTapAt=0;openText(h.x,h.y,h);requestRender();return}state.selected=h?h.id:null;lastTapId=h?h.id:null;lastTapAt=now;if(h){gesture={type:'selectPending',id:h.id,gx:g.x,gy:g.y,lastx:g.x,lasty:g.y,before:before,moved:false,startPoint:p};armLongPress(h,p)}else{gesture={type:'canvasPending',startPoint:p};armCanvasLongPress(p)}requestRender();return}state.selected=null;if(state.mode==='box'||state.mode==='ellipse'||state.mode==='line'||state.mode==='arrow'||state.mode==='free'){gesture={type:'drawPending',mode:state.mode,before:before,startGrid:{x:g.x,y:g.y},startPoint:{x:p.x,y:p.y},last:key(g.x,g.y)};draft=null;return}if(state.mode==='erase'){eraseTouched=new Set();gesture={type:'erase',before:before};eraseAt(g.x,g.y);return}}
function movePointer(ev){if(!pointers.has(ev.pointerId))return;pointers.set(ev.pointerId,canvasPoint(ev));if(pointers.size>=2&&pinch){cancelLongPress();var ps=Array.from(pointers.values()).slice(0,2),dx=ps[1].x-ps[0].x,dy=ps[1].y-ps[0].y,dist=Math.max(10,Math.hypot(dx,dy)),cx=(ps[0].x+ps[1].x)/2,cy=(ps[0].y+ps[1].y)/2,nz=clamp(pinch.zoom*(dist/pinch.dist),MIN_Z,MAX_Z),ratio=nz/pinch.zoom;state.zoom=nz;state.panX=cx-(pinch.cx-pinch.panX)*ratio;state.panY=cy-(pinch.cy-pinch.panY)*ratio;requestRender();return}if(!gesture)return;var g=gridPoint(ev),p=canvasPoint(ev);if(gesture.type==='canvasPending'){if(Math.hypot(p.x-gesture.startPoint.x,p.y-gesture.startPoint.y)>LONG_PRESS_MOVE){cancelLongPress();gesture=null}return}if(gesture.type==='selectPending'){var pe=state.entities.find(function(v){return v.id===gesture.id});if(!pe)return;var pd=Math.hypot(p.x-gesture.startPoint.x,p.y-gesture.startPoint.y);if(pd<=LONG_PRESS_MOVE)return;cancelLongPress();if(pe.locked){gesture.type='lockedSelect';return}gesture.type='move'}else if(gesture.startPoint&&Math.hypot(p.x-gesture.startPoint.x,p.y-gesture.startPoint.y)>LONG_PRESS_MOVE)cancelLongPress();if(gesture.type==='pan'){state.panX=gesture.px+(p.x-gesture.sx);state.panY=gesture.py+(p.y-gesture.sy);requestRender();return}if(gesture.type==='lockedSelect')return;if(gesture.type==='move'){var e=state.entities.find(function(v){return v.id===gesture.id});if(!e||e.locked)return;var dxg=g.x-gesture.lastx,dyg=g.y-gesture.lasty;if(dxg||dyg){translateEntity(e,dxg,dyg);gesture.lastx=g.x;gesture.lasty=g.y;gesture.moved=true;requestRender()}return}if(gesture.type==='resize'){var re=state.entities.find(function(v){return v.id===gesture.id});if(!re||re.locked)return;var prev=JSON.stringify(re);resizeEntity(re,gesture.handle,g,gesture.origin);if(JSON.stringify(re)!==prev){invalidateCommitted();gesture.moved=true;requestRender()}return}if(gesture.type==='drawPending'){var moved=Math.hypot(p.x-gesture.startPoint.x,p.y-gesture.startPoint.y)>=DRAW_THRESHOLD,sg=gesture.startGrid;if(!moved||(g.x===sg.x&&g.y===sg.y))return;if(gesture.mode==='free')draft={id:newId(),type:'free',points:[[sg.x,sg.y],[g.x,g.y]]};else draft={id:newId(),type:gesture.mode,x1:sg.x,y1:sg.y,x2:g.x,y2:g.y};gesture.type='draw';gesture.last=key(g.x,g.y);requestRender();return}if(gesture.type==='draw'&&draft){if(draft.type==='box'||draft.type==='ellipse'||draft.type==='line'||draft.type==='arrow'){draft.x2=g.x;draft.y2=g.y}else if(draft.type==='free'){var kk=key(g.x,g.y);if(kk!==gesture.last){draft.points.push([g.x,g.y]);gesture.last=kk}}requestRender();return}if(gesture.type==='erase')eraseAt(g.x,g.y)}
function endPointer(ev){cancelLongPress();if(pointers.has(ev.pointerId))pointers.delete(ev.pointerId);if(pointers.size<2&&pinch){pinch=null;scheduleSave();if(pointers.size===1)gesture=null;requestRender();return}if(pointers.size)return;if(!gesture)return;if(gesture.type==='drawPending'){draft=null;gesture=null;requestRender();return}if(gesture.type==='draw'){commitDraft();return}if(gesture.type==='move'||gesture.type==='resize'){var gb=gesture.before,mv=gesture.moved;gesture=null;if(mv)pushUndo(gb);scheduleSave();requestRender();return}if(gesture.type==='selectPending'||gesture.type==='lockedSelect'||gesture.type==='canvasPending'||gesture.type==='context'){gesture=null;requestRender();return}if(gesture.type==='erase'){var eb=gesture.before;gesture=null;eraseTouched=null;pushUndo(eb);requestRender();return}if(gesture.type==='pan'){gesture=null;scheduleSave();requestRender();return}gesture=null}
function eraseAt(x,y){var e=hitEntity(x,y);if(e&&e.locked)return;if(e&&(!eraseTouched||!eraseTouched.has(e.id))){if(eraseTouched)eraseTouched.add(e.id);removeEntity(e.id);requestRender()}}
function exportEntity(e){var q=JSON.parse(JSON.stringify(e));if(q.type==='box'||q.type==='ellipse'||q.type==='line'||q.type==='arrow'){q.x1=Math.round(q.x1*EXPORT_X_SCALE);q.x2=Math.round(q.x2*EXPORT_X_SCALE)}else if(q.type==='text'||q.type==='raw'){q.x=Math.round(q.x*EXPORT_X_SCALE)}else if(q.type==='free'){for(var i=0;i<q.points.length;i++)q.points[i][0]=Math.round(q.points[i][0]*EXPORT_X_SCALE)}return q}
function exportRaster(){return rasterizeEntities(state.entities.map(exportEntity))}
function exportASCII(){var m=exportRaster(),ks=Array.from(m.keys());if(!ks.length)return '';var pts=ks.map(function(k){var p=k.split(',');return[+p[0],+p[1]]}),minx=Math.min.apply(null,pts.map(function(p){return p[0]})),maxx=Math.max.apply(null,pts.map(function(p){return p[0]})),miny=Math.min.apply(null,pts.map(function(p){return p[1]})),maxy=Math.max.apply(null,pts.map(function(p){return p[1]})),lines=[];for(var y=miny;y<=maxy;y++){var s='';for(var x=minx;x<=maxx;x++)s+=m.get(key(x,y))||' ';lines.push(s.replace(/\s+$/,''))}while(lines.length&&lines[lines.length-1]==='')lines.pop();return lines.join('\n')}
function showExport(){byId('exportText').value=exportASCII();byId('exportSheet').classList.add('show')}
async function copyExport(){var t=byId('exportText').value;try{await window.webkit.messageHandlers.copyText.postMessage(t);toast('已复制')}catch(e){toast('复制失败')}}
async function importClipboard(){try{var t=await window.webkit.messageHandlers.readText.postMessage(null);if(!t){toast('剪贴板没有文本');return}var before=snapshot(),lines=String(t).replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');var ne={id:newId(),type:'raw',x:0,y:0,lines:lines};state.entities.push(ne);state.selected=ne.id;invalidateCommitted();pushUndo(before);byId('moreSheet').classList.remove('show');fit();toast('已导入')}catch(e){toast('导入失败')}}
function deleteSelected(){var e=selectedEntity();if(!e){toast('没有已选对象');return}if(e.locked){toast('对象已锁定');return}var before=snapshot();removeEntity(e.id);pushUndo(before);requestRender()}
function clearAll(){if(!state.entities.length)return;var locked=state.entities.filter(function(e){return !!e.locked});var before=snapshot();if(locked.length===state.entities.length){toast('对象均已锁定');byId('moreSheet').classList.remove('show');return}state.entities=locked;if(state.selected!=null&&!state.entities.some(function(e){return e.id===state.selected}))state.selected=null;invalidateCommitted();pushUndo(before);requestRender();byId('moreSheet').classList.remove('show');if(locked.length)toast('已保留锁定对象')}
var nativeTouchActive=false;
function touchPointer(t,isPrimary){return{pointerId:10000+t.identifier,pointerType:'touch',button:0,isPrimary:!!isPrimary,clientX:t.clientX,clientY:t.clientY}}
function onTouchStart(e){nativeTouchActive=true;if(e.cancelable)e.preventDefault();for(var i=0;i<e.changedTouches.length;i++){var t=e.changedTouches[i];startPointer(touchPointer(t,e.touches.length===1&&i===0))}}
function onTouchMove(e){if(e.cancelable)e.preventDefault();for(var i=0;i<e.changedTouches.length;i++){var t=e.changedTouches[i],pe=touchPointer(t,false);if(pointers.has(pe.pointerId))movePointer(pe)}}
function onTouchEnd(e){if(e.cancelable)e.preventDefault();for(var i=0;i<e.changedTouches.length;i++){var t=e.changedTouches[i],pe=touchPointer(t,false);if(pointers.has(pe.pointerId)||(gesture&&gesture.type==='draw'))endPointer(pe)}if(e.touches.length===0)nativeTouchActive=false}
function onTouchCancel(e){for(var i=0;i<e.changedTouches.length;i++){var t=e.changedTouches[i],pe=touchPointer(t,false);if(pointers.has(pe.pointerId)||(gesture&&gesture.type==='draw'))endPointer(pe)}if(e.touches.length===0)nativeTouchActive=false}
canvas.addEventListener('touchstart',onTouchStart,{passive:false});canvas.addEventListener('touchmove',onTouchMove,{passive:false});canvas.addEventListener('touchend',onTouchEnd,{passive:false});canvas.addEventListener('touchcancel',onTouchCancel,{passive:false});
canvas.addEventListener('pointerdown',function(e){if(e.pointerType==='touch'||nativeTouchActive)return;if(e.cancelable)e.preventDefault();startPointer(e)},{passive:false});window.addEventListener('pointermove',function(e){if(e.pointerType==='touch'||nativeTouchActive)return;if(!pointers.has(e.pointerId))return;if(e.cancelable)e.preventDefault();movePointer(e)},{capture:true,passive:false});window.addEventListener('pointerup',function(e){if(e.pointerType==='touch'||nativeTouchActive)return;if(!pointers.has(e.pointerId)&&!(gesture&&gesture.type==='draw'))return;if(e.cancelable)e.preventDefault();endPointer(e)},{capture:true,passive:false});window.addEventListener('pointercancel',function(e){if(e.pointerType==='touch'||nativeTouchActive)return;if(!pointers.has(e.pointerId)&&!(gesture&&gesture.type==='draw'))return;endPointer(e)},true);window.addEventListener('blur',finalizeStaleDraw);document.addEventListener('visibilitychange',function(){if(document.hidden)finalizeStaleDraw()});
canvas.addEventListener('wheel',function(e){e.preventDefault();if(e.ctrlKey||e.metaKey)zoomAt(e.deltaY<0?1.12:.89,e.offsetX,e.offsetY);else{state.panX-=e.deltaX;state.panY-=e.deltaY;render()}},{passive:false});
document.querySelectorAll('.tool[data-mode]').forEach(function(b){b.addEventListener('click',function(){setMode(b.dataset.mode)})});
byId('exitBtn').onclick=async function(){try{await flushSave();await window.webkit.messageHandlers.dismiss.postMessage(null)}catch(e){}};byId('undoBtn').onclick=undo;byId('redoBtn').onclick=redo;byId('exportBtn').onclick=showExport;byId('moreBtn').onclick=function(){byId('moreSheet').classList.add('show')};byId('closeMore').onclick=function(){byId('moreSheet').classList.remove('show')};byId('closeExport').onclick=function(){byId('exportSheet').classList.remove('show')};byId('copyExport').onclick=copyExport;byId('zoomIn').onclick=function(){var r=canvas.getBoundingClientRect();zoomAt(1.2,r.width/2,r.height/2)};byId('zoomOut').onclick=function(){var r=canvas.getBoundingClientRect();zoomAt(.83,r.width/2,r.height/2)};byId('fitBtn').onclick=fit;
byId('lockBtn').onclick=toggleContextLock;byId('contextCopy').onclick=copyContextEntity;byId('contextDelete').onclick=deleteContextEntity;byId('canvasPaste').onclick=pasteCanvasEntity;byId('entityMenu').addEventListener('click',function(e){e.stopPropagation()});byId('canvasMenu').addEventListener('click',function(e){e.stopPropagation()});document.addEventListener('click',function(e){if(byId('entityMenu').classList.contains('show')&&!byId('entityMenu').contains(e.target))closeEntityMenu();if(byId('canvasMenu').classList.contains('show')&&!byId('canvasMenu').contains(e.target))closeCanvasMenu()});
byId('unicodeBtn').onclick=function(){var b=snapshot();state.style='unicode';invalidateCommitted();syncStyleUI();pushUndo(b);requestRender()};byId('asciiBtn').onclick=function(){var b=snapshot();state.style='ascii';invalidateCommitted();syncStyleUI();pushUndo(b);requestRender()};byId('gridOnBtn').onclick=function(){state.grid=true;syncStyleUI();scheduleSave();render()};byId('gridOffBtn').onclick=function(){state.grid=false;syncStyleUI();scheduleSave();render()};byId('importBtn').onclick=importClipboard;byId('deleteBtn').onclick=deleteSelected;byId('clearBtn').onclick=clearAll;byId('textCancel').onclick=closeText;byId('textOK').onclick=commitText;
byId('exportSheet').addEventListener('click',function(e){if(e.target===this)this.classList.remove('show')});byId('moreSheet').addEventListener('click',function(e){if(e.target===this)this.classList.remove('show')});
window.addEventListener('keydown',function(e){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo()}else if((e.key==='Backspace'||e.key==='Delete')&&state.mode==='select'&&!byId('textEditor').classList.contains('show')){e.preventDefault();deleteSelected()}else if(e.key==='Escape'){state.selected=null;render()}});
window.addEventListener('resize',resize);window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').addEventListener&&window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',render);
(async function(){await loadSaved();resize();updateButtons()})();
})();
</script>
</body>
</html>`

let dismissPresentedView: (() => void) | null = null

function WebViewHost({ controller }: { controller: any }) {
  const dismiss = Navigation.useDismiss()
  dismissPresentedView = dismiss
  return <WebView
    controller={controller}
    frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
  />
}

async function run() {
  const WebViewControllerCtor = Runtime.WebViewController
  if (typeof WebViewControllerCtor !== "function") {
    throw new Error("当前 Scripting 运行时未提供 WebViewController")
  }

  const webView: any = new WebViewControllerCtor()
  const storage: any = Runtime.Storage
  const pasteboard: any = Runtime.Pasteboard
  const clipboard: any = Runtime.Clipboard

  await webView.addScriptMessageHandler("saveState", (payload?: string) => {
    if (typeof payload !== "string") return false
    if (storage?.set) return storage.set(STORAGE_KEY, payload)
    if (storage?.setString) {
      storage.setString(STORAGE_KEY, payload)
      return true
    }
    return false
  })

  await webView.addScriptMessageHandler("loadState", () => {
    if (storage?.get) return storage.get(STORAGE_KEY) ?? ""
    if (storage?.getString) return storage.getString(STORAGE_KEY) ?? ""
    return ""
  })

  await webView.addScriptMessageHandler("copyText", async (payload?: string) => {
    const text = typeof payload === "string" ? payload : ""
    if (pasteboard?.setString) {
      await pasteboard.setString(text)
      return true
    }
    if (clipboard?.copyText) {
      clipboard.copyText(text)
      return true
    }
    return false
  })

  await webView.addScriptMessageHandler("readText", async () => {
    if (pasteboard?.getString) return (await pasteboard.getString()) ?? ""
    if (clipboard?.getText) return clipboard.getText() ?? ""
    return ""
  })

  await webView.addScriptMessageHandler("dismiss", () => {
    if (dismissPresentedView) dismissPresentedView()
    return true
  })

  try {
    await webView.loadHTML(APP_HTML)
    await Navigation.present({
      element: <WebViewHost controller={webView} />,
      modalPresentationStyle: "fullScreen",
    })
  } finally {
    dismissPresentedView = null
    webView.dispose()
    Script.exit()
  }
}

run().catch((error) => {
  console.error(error)
  Script.exit()
})
