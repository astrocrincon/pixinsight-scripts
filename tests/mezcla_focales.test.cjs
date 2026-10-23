// Tests of the actual script with an in-memory adapter for native PJSR processes.
// The adapter is not a PixInsight implementation or a validation of native APIs.
const {test, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let registry, failure, ctx, executeDialog, messages;
// UI adapter: exercises the real dialog classes and their callbacks. Sizes and
// drawing calls are synthetic; this cannot validate Qt layout or PJSR bindings.
class FakeControl {
  constructor(parent) { this.children=[]; this.enabled=true; this.width=350; this.height=300; this.text=''; this.paints=[]; if(parent)parent.children.push(this); }
  setScaledMinSize(w,h) { this.width=w;this.height=h; }
  setScaledMinWidth(w) { this.width=Math.max(this.width,w); }
  setScaledFixedWidth(w) { this.width=w; }
  adjustToContents() {}
  update() { this.repaintRequests=(this.repaintRequests||0)+1; }
}
class FakeDialog extends FakeControl {
  ok() { this.accepted=true; }
  cancel() { this.accepted=false; }
  execute() { if(executeDialog)executeDialog(this);return !!this.accepted; }
}
class FakeButton extends FakeControl {
  click() { if(this.enabled && this.onClick)this.onClick(); }
}
class FakeSpinBox extends FakeControl {
  constructor(parent) { super(parent);this.minValue=0;this.maxValue=99;this._value=0; }
  get value() { return this._value; }
  set value(n) { this._value=Math.max(this.minValue,Math.min(this.maxValue,n)); }
  userValue(n) { if(!this.enabled)return;this.value=n;if(this.onValueUpdated)this.onValueUpdated(this.value); }
  setRange(a,b) { this.minValue=a;this.maxValue=b; }
}
class FakeViewList extends FakeControl {
  getMainViews() { this.views=[...registry.values()].map(w=>w.mainView);this.currentView={isNull:true}; }
}
class FakeSizer { add() {} addStretch() {} }
class FakeGraphics {
  constructor(control) { this.control=control;this.calls=[];control.paints.push(this); }
  fillRect(...args) { this.calls.push(['fill',...args]); }
  drawScaledBitmapRect(...args) { this.calls.push(['bitmap',...args]); }
  drawLine(...args) { this.calls.push(['line',...args]); }
  drawRect(...args) { this.calls.push(['rect',...args]); }
  end() { this.ended=true; }
}
class FakeImage {
  constructor(w,h,c=1) { this.width=w; this.height=h; this.numberOfChannels=c; this.numberOfNominalChannels=c; this.isColor=c===3; this.data=new Float64Array(w*h*c); this.selection={channel:0,rect:'selected ROI'}; this.stack=[]; }
  sample(x,y,c) { return this.data[(y*this.width+x)*this.numberOfChannels+c]; }
  set(x,y,c,v) { this.data[(y*this.width+x)*this.numberOfChannels+c]=v; }
  pushSelections() { this.stack.push({...this.selection}); }
  resetSelections() { this.selection={channel:'all',rect:'full'}; }
  popSelections() { this.selection=this.stack.pop(); }
  assign(source) { if(failure==='assign') throw Error('injected assign failure'); this.data.set(source.data); }
  render() { if(failure==='render') throw Error('injected render failure'); return {width:this.width,height:this.height,data:this.data.slice()}; }
}
class FakeWindow {
  constructor(w,h,c,bits,floating,color,id) {
    this.isNull=false; this.keywords=[]; this.hasAstrometricSolution=false; this.closed=false;
    let name=id;
    this.mainView={image:new FakeImage(w,h,c),window:this,isNull:false,isPreview:false,beginProcess(){},endProcess(){}};
    Object.defineProperty(this.mainView,'id',{get:()=>name,set:value=>{registry.delete(name); name=value; registry.set(name,this);}});
    registry.set(id,this);
  }
  static windowById(id) { return registry.get(id)||{isNull:true}; }
  forceClose() { this.closed=true; this.isNull=true; this.mainView.isNull=true; registry.delete(this.mainView.id); }
  hide() {}
  show() { if(failure==='show') throw Error('injected show failure'); this.shown=true; }
  copyAstrometricSolution(source) { this.hasAstrometricSolution=source.hasAstrometricSolution; }
}
class FakePixelMath {
  static Gray=0; static RGB=1; static f32=32;
  executeOn(reference) {
    if(failure==='pixelmath') throw Error('injected PixelMath failure');
    const out=new FakeWindow(this.newImageWidth,this.newImageHeight,this.newImageColorSpace===1?3:1,32,true,this.newImageColorSpace===1,this.newImageId);
    const windows=[...registry.entries()].filter(([name])=>this.expression.includes(name));
    const fn=new Function(...windows.map(([name])=>name),'min','max','iif','x','y','return '+this.expression);
    const image=out.mainView.image;
    for(let y=0;y<image.height;y++) for(let x=0;x<image.width;x++) for(let c=0;c<image.numberOfChannels;c++) {
      const values=windows.map(([,win])=>win.mainView.image.sample(x,y,win.mainView.image.isColor?c:0));
      image.set(x,y,c,fn(...values,Math.min,Math.max,(condition,a,b)=>condition?a:b,()=>x,()=>y));
    }
    return true;
  }
}
class FakeConvolution {
  static Parametric=0;
  executeOn(view) {
    const image=view.image,radius=Math.ceil(3*this.sigma),kernel=[];
    let norm=0;
    for(let d=-radius;d<=radius;d++){let v=Math.exp(-0.5*(d/this.sigma)**2);kernel.push(v);norm+=v;}
    const source=image.data.slice(),tmp=new Float64Array(source.length);
    const {width:w,height:h,numberOfChannels:c}=image;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) for(let k=0;k<c;k++) {
      let value=0;
      for(let d=-radius;d<=radius;d++) value+=kernel[d+radius]*source[(y*w+Math.max(0,Math.min(w-1,x+d)))*c+k]/norm;
      tmp[(y*w+x)*c+k]=value;
    }
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) for(let k=0;k<c;k++) {
      let value=0;
      for(let d=-radius;d<=radius;d++) value+=kernel[d+radius]*tmp[(Math.max(0,Math.min(h-1,y+d))*w+x)*c+k]/norm;
      image.set(x,y,k,value);
    }
    return true;
  }
}
beforeEach(()=>{
  registry=new Map();failure=null;executeDialog=null;messages=[];
  ctx=vm.createContext({Dialog:FakeDialog,Control:FakeControl,Label:FakeControl,Edit:FakeControl,
    CheckBox:FakeControl,TextBox:FakeControl,SpinBox:FakeSpinBox,Slider:FakeSpinBox,
    PushButton:FakeButton,ViewList:FakeViewList,VerticalSizer:FakeSizer,HorizontalSizer:FakeSizer,
    Graphics:FakeGraphics,Pen:class{},Brush:class{},MouseButton:{Left:1},
    MessageBox:class{constructor(message){messages.push(message);}execute(){return 1;}},
    StdIcon_Error:0,StdIcon_Warning:1,StdButton_Ok:1,CoreApplication:{processEvents(){}},
    ImageWindow:FakeWindow,PixelMath:FakePixelMath,Convolution:FakeConvolution,
    console:{warningln(){},writeln(){}}});
  const file=path.join(__dirname,'../src/scripts/crinconlab/Mezcla_Focales.js');
  const code=fs.readFileSync(file,'utf8').split('#ifndef CR_MF_LIBRARY')[0].replace(/^#.*$/gm,'');
  vm.runInContext(code,ctx,{filename:file});
  vm.runInContext('this.MaskDialog=MF_MaskDialog;this.SetupDialog=MF_SetupDialog;this.PreviewDialog=MF_PreviewDialog;',ctx);
});
function fixture(same=false) {
  const base=new FakeWindow(32,32,1,32,true,false,'Base');
  const detail=new FakeWindow(32,32,1,32,true,false,'Detail');
  const mask=new FakeWindow(32,32,1,32,true,false,'Mask');
  for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
    let b=0.3+0.08*Math.sin(x/4)+0.04*Math.cos(y/3);
    base.mainView.image.set(x,y,0,b);
    detail.mainView.image.set(x,y,0,same?b:b+0.025*Math.sin(x*1.2));
    mask.mainView.image.set(x,y,0,x>=5&&x<27&&y>=5&&y<27?1:0);
  }
  return {base:base.mainView,detail:detail.mainView,mask:mask.mainView,fine:1,coarse:4,feather:2,autoGain:false,id:'Output',prepared:true};
}
function almost(a,b,eps=1e-10) { assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`); }
function box(x0=5,y0=5,x1=27,y1=27) { return [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}]; }
function button(dialog,text) { const b=dialog.children.find(c=>c instanceof FakeButton&&c.text===text);assert.ok(b,'Missing button '+text);return b; }
function screen(pane,x,y,w=32,h=32) {
  const s=Math.min(pane.width/w,pane.height/h);return [(pane.width-w*s)/2+x*s,(pane.height-h*s)/2+y*s];
}
function clickPoint(dialog,x,y) { const p=screen(dialog.detailPane,x,y);dialog.detailPane.onMousePress(...p,1);dialog.detailPane.onMouseRelease(...p,1); }
function drawBox(dialog) { box().forEach(p=>clickPoint(dialog,p.x,p.y));dialog.closePolygon.click(); }

test('missing registration, wrong mask and invalid scale ranges are rejected',()=>{
  const c=fixture(); c.mask.image.width=31;
  assert.throws(()=>ctx.MF_validate(c),/dimensiones/);
  c.mask.image.width=32;c.fine=4;
  assert.throws(()=>ctx.MF_validate(c),/Sigma menor/);
  c.fine=1;c.prepared=false;
  assert.throws(()=>ctx.MF_validate(c),/Confirma/);
});
test('real preparation and repeated updates preserve inputs and the exterior of the coverage',()=>{
  const c=fixture(),originals=[c.base,c.detail,c.mask].map(v=>v.image.data.slice());
  const selections=[c.base,c.detail,c.mask].map(v=>({...v.image.selection}));
  const state=ctx.MF_prepare(c);
  const a=ctx.MF_update(state,0.6,1).mainView.image.data.slice();
  assert.ok([...a].some((v,i)=>Math.abs(v-originals[0][i])>1e-6));
  for(let y=0;y<32;y++) for(let x=0;x<32;x++) if(!c.mask.image.sample(x,y,0)) almost(a[y*32+x],originals[0][y*32+x]);
  ctx.MF_update(state,0.2,1.5);
  const repeated=ctx.MF_update(state,0.6,1).mainView.image.data;
  a.forEach((v,i)=>almost(v,repeated[i]));
  [c.base,c.detail,c.mask].forEach((v,i)=>{assert.deepEqual(v.image.data,originals[i]);assert.deepEqual(v.image.selection,selections[i]);});
  state.work.dispose();assert.equal(registry.size,3);
});
test('identical images remain identical under partial coverage and feathering',()=>{
  const c=fixture(true),state=ctx.MF_prepare(c);
  const out=ctx.MF_update(state,1,1).mainView.image.data;
  out.forEach((v,i)=>almost(v,c.base.image.data[i]));
  state.work.dispose();
});
test('zero intensity is an exact copy and a failed recalculation retains the last comparison',()=>{
  const c=fixture(),state=ctx.MF_prepare(c),out=ctx.MF_update(state,0,1);
  assert.deepEqual(out.mainView.image.data,c.base.image.data);
  const oldWindows=registry.size;
  assert.throws(()=>ctx.MF_update(state,0.5,1,()=>{throw Error('render failed');}),/render failed/);
  assert.equal(state.result,out);assert.equal(out.isNull,false);assert.equal(state.amount,0);
  assert.equal(registry.size,oldWindows);
  state.work.dispose();assert.equal(registry.size,3);
});
test('failure during preparation removes owned temporaries and restores source selections',()=>{
  const c=fixture(),selection={...c.base.image.selection};failure='assign';
  assert.throws(()=>ctx.MF_prepare(c),/assign failure/);
  assert.equal(registry.size,3);assert.deepEqual(c.base.image.selection,selection);
});
test('empty coverage fails without leaving temporary windows',()=>{
  const c=fixture();c.mask.image.data.fill(0);
  assert.throws(()=>ctx.MF_prepare(c),/suficiente zona/);assert.equal(registry.size,3);
});
test('stale acceptance is blocked and the accepted output survives cleanup',()=>{
  const c=fixture(),state=ctx.MF_prepare(c);ctx.MF_update(state,0.35,1);
  assert.throws(()=>ctx.MF_accept(state,'Output',0.5,1),/Actualiza/);
  const result=ctx.MF_accept(state,'Output',0.35,1);
  state.work.dispose();assert.equal(registry.size,4);assert.equal(result.isNull,false);assert.equal(result.shown,true);
});
test('gain fit separates multiplicative contrast from an additive background offset',()=>{
  const pairs=Array.from({length:200},(_,i)=>[0.05+i/500,0.17+1.8*(0.05+i/500)]);
  const fit=ctx.MF_fitGain(pairs);assert.equal(fit.reliable,true);almost(fit.gain,1.8);almost(fit.offset,0.17);
  assert.equal(ctx.MF_fitGain(Array.from({length:80},()=>[0.2,0.3])).reliable,false);
  assert.equal(ctx.MF_fitGain([[0,0],[1,1]]).reliable,false);
});
test('zoom preserves the image coordinate beneath the pointer, and pan remains within the image',()=>{
  const c=new ctx.MF_Camera(6000,4000);c.fit(600,400);
  const before={x:c.x+(400-300)/c.scale,y:c.y+(250-200)/c.scale};
  c.zoom(2,400,250,600,400);
  almost(c.x+(400-300)/c.scale,before.x);almost(c.y+(250-200)/c.scale,before.y);
  c.pan(100000,-100000,600,400);
  assert.ok(c.x>=600/(2*c.scale));assert.ok(c.y<=4000-400/(2*c.scale));
});

test('polygon validation rejects invalid bounds, insufficient vertices and zero area',()=>{
  assert.equal(ctx.MF_polygon(box(),32,32).length,4);
  assert.throws(()=>ctx.MF_polygon(box(-1),32,32),/lienzo/);
  assert.throws(()=>ctx.MF_polygon([{x:NaN,y:2},{x:5,y:2},{x:5,y:5}],32,32),/finitas/);
  assert.throws(()=>ctx.MF_polygon(box().slice(0,2),32,32),/3 y 64/);
  assert.throws(()=>ctx.MF_polygon([{x:2,y:2},{x:3,y:3},{x:4,y:4}],32,32),/retroceder|superficie/);
});
test('mask drawing maps a letterboxed preview to exact image coordinates and clamps margins',()=>{
  const p=ctx.MF_maskPoint(300,100,600,400,6000,2000);
  almost(p.x,3000);almost(p.y,0);
  const q=ctx.MF_maskPoint(-30,500,600,400,6000,2000);
  almost(q.x,0);almost(q.y,2000);
});
test('a created coverage is monochrome geometry even when the entire detail is black',()=>{
  const c=fixture();c.detail.image.data.fill(0);
  const before=c.detail.image.data.slice(), selection={...c.detail.image.selection};
  const mask=ctx.MF_createCoverage(c.detail,box());
  assert.equal(mask.mainView.image.numberOfChannels,1);assert.equal(mask.shown,true);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++)
    assert.equal(mask.mainView.image.sample(x,y,0),x>=5&&x<27&&y>=5&&y<27?1:0);
  assert.deepEqual(c.detail.image.data,before);assert.deepEqual(c.detail.image.selection,selection);
  assert.equal(registry.size,4);mask.forceClose();
});
test('mask preview matches the effective blend mask without baking a second transition into the support',()=>{
  const c=fixture(),rect=box();
  const mask=ctx.MF_createCoverage(c.detail,rect);
  const bitmap=ctx.MF_renderCoverage(c.detail,rect,2);
  assert.equal(registry.size,4);
  const state=ctx.MF_prepare({...c,mask:mask.mainView});
  bitmap.data.forEach((v,i)=>almost(v,state.mask.mainView.image.data[i]));
  assert.ok(bitmap.data[5*32+16]>0 && bitmap.data[5*32+16]<1);
  assert.equal(bitmap.data[4*32+16],0);
  assert.equal(mask.mainView.image.sample(16,5,0),1);
  state.work.dispose();
  const hard=ctx.MF_renderCoverage(c.detail,rect,0);
  assert.deepEqual(hard.data,mask.mainView.image.data);
  assert.equal(registry.size,4);
});
test('mask preview and creation failures remove only their own windows',()=>{
  const c=fixture(),rect=box();
  for(const error of ['render','assign','pixelmath']) {
    failure=error;
    assert.throws(()=>ctx.MF_renderCoverage(c.detail,rect,2),/injected/);
    assert.equal(registry.size,3);
  }
  failure='show';
  assert.throws(()=>ctx.MF_createCoverage(c.detail,rect),/show failure/);
  assert.equal(registry.size,3);
});

test('a rotated footprint excludes its bounding-box corners in either winding direction',()=>{
  const c=fixture(),diamond=[{x:16,y:3},{x:29,y:16},{x:16,y:29},{x:3,y:16}];
  const mask=ctx.MF_createCoverage(c.detail,diamond);
  const reversed=ctx.MF_createCoverage(c.detail,[...diamond].reverse());
  assert.deepEqual(mask.mainView.image.data,reversed.mainView.image.data);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++) {
    const distance=Math.abs(x+0.5-16)+Math.abs(y+0.5-16);
    if(distance!==13)assert.equal(mask.mainView.image.sample(x,y,0),distance<13?1:0);
  }
  assert.equal(mask.mainView.image.sample(4,4,0),0);
  assert.equal(mask.mainView.image.sample(16,16,0),1);
  const full=ctx.MF_createCoverage(c.detail,box(0,0,32,32));
  assert.ok([...full.mainView.image.data].every(x=>x===1));
});
test('a concave polygon preserves its notch and shares feathering with the actual blend',()=>{
  const c=fixture(),points=[{x:4,y:4},{x:28,y:4},{x:28,y:12},{x:12,y:12},{x:12,y:28},{x:4,y:28}];
  const mask=ctx.MF_createCoverage(c.detail,points),hard=mask.mainView.image;
  for(let y=0;y<32;y++)for(let x=0;x<32;x++)
    assert.equal(hard.sample(x,y,0),x>=4&&x<28&&y>=4&&y<28&&(x<12||y<12)?1:0);
  const rotatedOrder=[...points.slice(2),...points.slice(0,2)];
  const reversed=ctx.MF_renderCoverage(c.detail,rotatedOrder.reverse(),0);
  assert.deepEqual(hard.data,reversed.data);
  const preview=ctx.MF_renderCoverage(c.detail,points,1);
  const state=ctx.MF_prepare({...c,mask:mask.mainView,feather:1});
  preview.data.forEach((v,i)=>almost(v,state.mask.mainView.image.data[i]));
  assert.equal(preview.data[16*32+16],0);
  const out=ctx.MF_update(state,0.7,1).mainView.image;
  for(let i=0;i<hard.data.length;i++)if(!hard.data[i])almost(out.data[i],c.base.image.data[i]);
  state.work.dispose();assert.equal(registry.size,4);
});
test('self-crossings, repeated vertices, touching edges and retraced edges are rejected',()=>{
  const invalid=[
    [{x:4,y:4},{x:28,y:28},{x:4,y:28},{x:28,y:4}],
    [...box(),{x:5,y:5}],
    [{x:4,y:4},{x:28,y:4},{x:28,y:28},{x:16,y:4},{x:4,y:28}],
    [{x:4,y:4},{x:28,y:4},{x:16,y:4},{x:16,y:28},{x:4,y:28}]
  ];
  const c=fixture();
  invalid.forEach(points=>{
    assert.throws(()=>ctx.MF_polygon(points,32,32),/cruzarse|repitas|retroceder/);
    assert.throws(()=>ctx.MF_createCoverage(c.detail,points));
    assert.equal(registry.size,3);
  });
});
test('selection requires closure, allows correction and undo, and enforces the vertex limit',()=>{
  const s=new ctx.MF_PolygonSelection(32,32);
  s.add(-4,3.6);s.add(40,4);s.add(16,40);
  assert.deepEqual({...s.points[0]},{x:0,y:4});assert.equal(s.points[2].y,32);
  assert.throws(()=>s.polygon(),/Cierra/);s.close();assert.equal(s.polygon().length,3);
  assert.throws(()=>s.add(3,3),/Reabre/);
  s.undo();assert.equal(s.closed,false);assert.equal(s.points.length,3);
  s.undo();assert.equal(s.points.length,2);assert.throws(()=>s.close(),/3 y 64/);
  s.add(16,32);s.close();
  const limit=new ctx.MF_PolygonSelection(32,32);
  for(let i=0;i<64;i++)limit.add(16+14*Math.cos(i*Math.PI/32),16+14*Math.sin(i*Math.PI/32));
  assert.throws(()=>limit.add(16,16),/64/);
  const invalid=new ctx.MF_PolygonSelection(32,32);
  [[4,4],[28,28],[4,28],[28,4]].forEach(([x,y])=>invalid.add(x,y));
  assert.throws(()=>invalid.close(),/cruzarse/);assert.equal(invalid.closed,false);
});

test('UI: opening, clicks and closing via the first vertex enable preview and creation',()=>{
  const c=fixture(),selection={...c.detail.image.selection},d=new ctx.MaskDialog(c.detail,2);
  assert.equal(d.preview.enabled,false);assert.equal(d.create.enabled,false);assert.equal(d.vertexX.enabled,false);
  box().forEach(p=>clickPoint(d,p.x,p.y));
  assert.equal(d.selection.closed,false);assert.equal(d.preview.enabled,false);assert.equal(d.closePolygon.enabled,true);
  clickPoint(d,5,5);
  assert.equal(d.selection.closed,true);assert.equal(d.preview.enabled,true);assert.equal(d.create.enabled,true);
  d.detailPane.onPaint();const paint=d.detailPane.paints.at(-1);
  assert.equal(paint.calls.filter(c=>c[0]==='line').length,4);assert.equal(paint.ended,true);
  assert.deepEqual(c.detail.image.selection,selection);assert.equal(registry.size,3);
});
test('UI: vertex zero drags correctly and numeric edits invalidate the displayed mask',()=>{
  const c=fixture(),d=new ctx.MaskDialog(c.detail,2);drawBox(d);d.preview.click();
  assert.ok(d.maskBitmap);
  const pane=d.detailPane,start=screen(pane,5,5),end=screen(pane,7,6);
  pane.onMousePress(...start,1);pane.onMouseMove(...end,1);pane.onMouseRelease(...end,1);
  assert.deepEqual({...d.selection.points[0]},{x:7,y:6});assert.equal(pane.drag,null);
  assert.equal(d.maskBitmap,null);assert.equal(d.vertex.value,1);assert.equal(d.vertexX.value,7);
  d.vertex.userValue(2);d.vertexX.userValue(26);
  assert.deepEqual({...d.selection.points[1]},{x:26,y:5});assert.equal(d.selection.points.length,4);
  d.preview.click();assert.ok(d.maskBitmap);d.feather.userValue(1);assert.equal(d.maskBitmap,null);
  assert.equal(d.preview.enabled,true);assert.equal(registry.size,3);
});
test('UI: crossing contours block creation, undo reopens, and clear resets the controls',()=>{
  const c=fixture(),d=new ctx.MaskDialog(c.detail,2);
  [[5,5],[27,27],[5,27],[27,5]].forEach(([x,y])=>clickPoint(d,x,y));d.closePolygon.click();
  assert.equal(d.selection.closed,false);assert.equal(d.create.enabled,false);assert.match(d.status.text,/cruzarse/);
  d.clear.click();assert.equal(d.selection.points.length,0);assert.equal(d.vertex.enabled,false);
  drawBox(d);d.preview.click();d.undo.click();
  assert.equal(d.selection.closed,false);assert.equal(d.selection.points.length,4);assert.equal(d.maskBitmap,null);
  assert.equal(d.create.enabled,false);d.undo.click();assert.equal(d.selection.points.length,3);
  d.fullFrame.click();assert.equal(d.selection.closed,true);assert.equal(d.create.enabled,true);
  d.clear.click();assert.equal(d.preview.enabled,false);assert.equal(d.undo.enabled,false);
});
test('UI: cancellation and failed renders leave no images and preserve the input selection',()=>{
  const c=fixture(),selection={...c.detail.image.selection};
  failure='render';assert.throws(()=>new ctx.MaskDialog(c.detail,2),/render failure/);
  assert.deepEqual(c.detail.image.selection,selection);assert.equal(registry.size,3);
  failure=null;const d=new ctx.MaskDialog(c.detail,2);drawBox(d);d.preview.click();assert.ok(d.maskBitmap);
  failure='render';d.preview.click();assert.equal(d.maskBitmap,null);assert.match(d.status.text,/render failure/);
  assert.equal(d.busy,false);assert.equal(d.preview.enabled,true);assert.equal(registry.size,3);
  failure=null;d.preview.click();assert.ok(d.maskBitmap);button(d,'Cancelar').click();
  assert.equal(d.accepted,false);assert.equal(d.result,null);assert.equal(registry.size,3);
});
test('UI: creation errors keep the editor open and a retry retains only the accepted mask',()=>{
  const c=fixture(),d=new ctx.MaskDialog(c.detail,2);drawBox(d);
  failure='show';d.create.click();assert.equal(d.result,null);assert.notEqual(d.accepted,true);
  assert.match(d.status.text,/show failure/);assert.equal(registry.size,3);
  failure=null;d.create.click();assert.equal(d.accepted,true);assert.equal(d.result.shown,true);
  assert.equal(registry.size,4);assert.equal(d.result.mainView.image.sample(16,5,0),1);
});
test('UI: setup receives the new mask and transition, and cancelling a second editor keeps them',()=>{
  const c=fixture(),d=new ctx.SetupDialog();d.detail.currentView=c.detail;d.mask.currentView=c.mask;d.prepared.checked=true;
  executeDialog=editor=>{drawBox(editor);editor.feather.userValue(3);editor.create.click();};
  button(d,'Crear máscara…').click();
  assert.notEqual(d.mask.currentView,c.mask);assert.equal(d.mask.currentView.image.numberOfChannels,1);
  assert.equal(d.feather.value,3);assert.equal(d.prepared.checked,false);assert.equal(registry.size,4);
  const saved=d.mask.currentView;d.prepared.checked=true;
  executeDialog=editor=>{drawBox(editor);editor.preview.click();button(editor,'Cancelar').click();};
  button(d,'Crear máscara…').click();assert.equal(d.mask.currentView,saved);
  assert.equal(d.prepared.checked,true);assert.equal(registry.size,4);assert.equal(messages.length,0);
});
test('UI: comparison disables stale acceptance, survives recalculation failure and accepts a retry',()=>{
  const c=fixture(),state=ctx.MF_prepare(c),d=new ctx.PreviewDialog(state);
  assert.equal(d.ready,true);assert.equal(d.acceptButton.enabled,true);
  const first=state.result;d.amount.userValue(60);assert.equal(d.acceptButton.enabled,false);
  failure='render';d.updateButton.click();assert.equal(state.result,first);assert.equal(first.isNull,false);
  assert.match(d.status.text,/render failure/);assert.equal(d.busy,false);assert.equal(d.updateButton.enabled,true);
  assert.equal(d.acceptButton.enabled,false);
  failure=null;d.updateButton.click();assert.equal(d.acceptButton.enabled,true);assert.equal(state.amount,0.6);
  d.acceptButton.click();assert.equal(d.accepted,true);state.work.dispose();
  assert.equal(registry.size,4);assert.equal(state.result.shown,true);
});
test('UI: both comparison panes share zoom, pan and drawing; back and discard route correctly',()=>{
  const c=fixture(),state=ctx.MF_prepare(c),d=new ctx.PreviewDialog(state);
  const left=d.originalPane,right=d.resultPane;left.width=right.width=16;left.height=right.height=16;d.fit();
  const initial=d.camera.scale;right.onMouseWheel(8,8,1);assert.ok(d.camera.scale>initial);
  const x=d.camera.x;left.onMousePress(8,8,1);left.onMouseMove(10,8,1);left.onMouseRelease();
  assert.notEqual(d.camera.x,x);left.onPaint();right.onPaint();
  const a=left.paints.at(-1),b=right.paints.at(-1);
  assert.deepEqual(a.calls.find(c=>c[0]==='bitmap').slice(1,5),b.calls.find(c=>c[0]==='bitmap').slice(1,5));
  assert.equal(a.ended,true);assert.equal(b.ended,true);
  d.backButton.click();assert.equal(d.returnToSetup,true);assert.equal(d.accepted,false);
  d.closeButton.click();assert.equal(d.returnToSetup,false);state.work.dispose();assert.equal(registry.size,3);
});

