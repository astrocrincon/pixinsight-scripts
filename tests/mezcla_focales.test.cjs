// Tests of the actual script with an in-memory adapter for native PJSR processes.
// The adapter is not a PixInsight implementation or a validation of native APIs.
const {test, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let registry, failure, ctx;
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
  registry=new Map();failure=null;
  ctx=vm.createContext({Dialog:class{},ImageWindow:FakeWindow,PixelMath:FakePixelMath,Convolution:FakeConvolution,
    console:{warningln(){},writeln(){}}});
  const file=path.join(__dirname,'../src/scripts/crinconlab/Mezcla_Focales.js');
  const code=fs.readFileSync(file,'utf8').split('#ifndef CR_MF_LIBRARY')[0].replace(/^#.*$/gm,'');
  vm.runInContext(code,ctx,{filename:file});
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

test('rectangle selection supports reverse drags, pixel bounds and rejects empty coverage',()=>{
  const r=ctx.MF_rectangle(40.7,23.2,-4,-9,32,32);
  assert.deepEqual({...r},{x0:0,y0:0,x1:32,y1:24});
  assert.throws(()=>ctx.MF_rectangle(5.2,4,5.2,20,32,32),/anchura/);
  assert.throws(()=>ctx.MF_rectangle(40,4,50,20,32,32),/anchura/);
  assert.throws(()=>ctx.MF_rectangle(NaN,4,20,20,32,32),/finitos/);
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
  const mask=ctx.MF_createCoverage(c.detail,{x0:5,y0:5,x1:27,y1:27});
  assert.equal(mask.mainView.image.numberOfChannels,1);assert.equal(mask.shown,true);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++)
    assert.equal(mask.mainView.image.sample(x,y,0),x>=5&&x<27&&y>=5&&y<27?1:0);
  assert.deepEqual(c.detail.image.data,before);assert.deepEqual(c.detail.image.selection,selection);
  assert.equal(registry.size,4);mask.forceClose();
});
test('mask preview matches the effective blend mask without baking a second transition into the support',()=>{
  const c=fixture(),rect={x0:5,y0:5,x1:27,y1:27};
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
  const c=fixture(),rect={x0:5,y0:5,x1:27,y1:27};
  for(const error of ['render','assign','pixelmath']) {
    failure=error;
    assert.throws(()=>ctx.MF_renderCoverage(c.detail,rect,2),/injected/);
    assert.equal(registry.size,3);
  }
  failure='show';
  assert.throws(()=>ctx.MF_createCoverage(c.detail,rect),/show failure/);
  assert.equal(registry.size,3);
});

