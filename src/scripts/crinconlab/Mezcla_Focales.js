// Copyright © Carlos Rincón 2026
#feature-id crinconlab.MezclaFocales : Utilities > Mezcla de focales
#feature-info Mezcla selectiva de detalle entre focales. Imágenes estiradas, sin estrellas y registradas. Versión de desarrollo 0.1.0.
#engine v8
#include <pjsr/Sizer.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdButton.jsh>

/*
 * No se alinean, estiran ni reescalan las entradas. La cuadrícula de la base
 * determina la resolución de salida. La máscara debe representar cobertura
 * válida, no el brillo de la nebulosa. Los procesos actúan solo sobre copias.
 * Las bandas se obtienen por diferencia de gaussianas normalizadas con máscara;
 * no son las capas de MultiscaleLinearTransform.
 */
var MF_VERSION = "0.1.0";

function MF_clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function MF_number(value, name, low, high)
{
   var text = String(value).trim().replace(",", "."), n = Number(text);
   if (!text || !isFinite(n) || n < low || n > high)
      throw new Error(name + ": escribe un valor entre " + low + " y " + high + ".");
   return n;
}
function MF_validId(id)
{
   if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id))
      throw new Error("El nombre de salida debe comenzar con una letra o guion bajo y contener solo letras sin tildes, números y guion bajo.");
}
function MF_unique(tag)
{
   var base = "CR_MF_" + tag, id = base, i = 2;
   while (!ImageWindow.windowById(id).isNull) id = base + "_" + i++;
   return id;
}
function MF_assertView(view, name)
{
   if (!view || view.isNull || view.isPreview)
      throw new Error(name + ": selecciona una imagen principal abierta.");
   var image = view.image, channels = image.numberOfNominalChannels;
   if ((channels != 1 && channels != 3) || image.numberOfChannels != channels)
      throw new Error(name + ": se admite monocromo o RGB, sin canales alfa.");
}
function MF_validate(config)
{
   MF_assertView(config.base, "Base de gran campo");
   MF_assertView(config.detail, "Detalle de focal larga");
   MF_assertView(config.mask, "Máscara de cobertura");
   var w = config.base.image.width, h = config.base.image.height;
   if (config.detail.image.width != w || config.detail.image.height != h ||
       config.mask.image.width != w || config.mask.image.height != h)
      throw new Error("Base, detalle y máscara deben tener las mismas dimensiones y estar registrados sobre la misma cuadrícula. El script no registra ni cambia la resolución.");
   if (config.mask.image.numberOfNominalChannels != 1)
      throw new Error("La máscara debe ser monocroma: blanco dentro de la cobertura válida y negro fuera.");
   config.fine = MF_number(config.fine, "Sigma menor", 0, 16);
   config.coarse = MF_number(config.coarse, "Sigma mayor", 0.25, 64);
   if (config.fine >= config.coarse) throw new Error("Sigma menor debe ser inferior a sigma mayor.");
   config.feather = MF_number(config.feather, "Transición de cobertura", 0, 256);
   MF_validId(config.id);
   if (!ImageWindow.windowById(config.id).isNull)
      throw new Error("Ya existe una imagen llamada " + config.id + ".");
   if (!config.prepared)
      throw new Error("Confirma que las imágenes están estiradas, sin estrellas y registradas y que la máscara solo incluye cobertura válida.");
}

// Registro de propiedad: nunca contiene ventanas originales del usuario.
function MF_Work()
{
   this.windows = [];
}
MF_Work.prototype.own = function(window)
{
   if (window && !window.isNull && this.windows.indexOf(window) < 0) this.windows.push(window);
   return window;
};
MF_Work.prototype.release = function(window)
{
   var index = this.windows.indexOf(window);
   if (index >= 0) this.windows.splice(index, 1);
};
MF_Work.prototype.close = function(window)
{
   if (this.windows.indexOf(window) < 0) return;
   if (window && !window.isNull) window.forceClose();
   this.release(window);
};
MF_Work.prototype.dispose = function()
{
   var errors = [];
   while (this.windows.length)
   {
      var window = this.windows.pop();
      try { if (window && !window.isNull) window.forceClose(); }
      catch (e) { errors.push(String(e)); }
   }
   if (errors.length) console.warningln("No se pudieron cerrar algunos temporales: " + errors.join("; "));
};
function MF_identitySTF(view)
{
   view.stf = [[0.5,0,1,0,1],[0.5,0,1,0,1],[0.5,0,1,0,1],[0.5,0,1,0,1]];
}
function MF_copyMetadata(source, destination)
{
   destination.keywords = source.keywords;
   if (source.hasAstrometricSolution) destination.copyAstrometricSolution(source);
}
function MF_clone(view, work, tag)
{
   var image = view.image;
   var window = work.own(new ImageWindow(image.width, image.height,
      image.numberOfNominalChannels, 32, true, image.isColor, MF_unique(tag)));
   image.pushSelections();
   try
   {
      image.resetSelections();
      window.mainView.beginProcess();
      try { window.mainView.image.assign(image); }
      finally { window.mainView.endProcess(); }
   }
   finally { image.popSelections(); }
   MF_identitySTF(window.mainView);
   return window;
}
function MF_math(expression, reference, work, tag, color)
{
   var id = MF_unique(tag), p = new PixelMath, result = null;
   p.expression = expression;
   p.useSingleExpression = true;
   p.generateOutput = true;
   p.singleThreaded = false;
   p.use64BitWorkingImage = true;
   p.rescale = false;
   p.truncate = false;
   p.createNewImage = true;
   p.showNewImage = false;
   p.newImageId = id;
   p.newImageWidth = reference.image.width;
   p.newImageHeight = reference.image.height;
   p.newImageAlpha = false;
   p.newImageColorSpace = color ? PixelMath.RGB : PixelMath.Gray;
   p.newImageSampleFormat = PixelMath.f32;
   try
   {
      if (!p.executeOn(reference)) throw new Error("PixelMath no completó " + tag + ".");
   }
   finally
   {
      result = ImageWindow.windowById(id);
      if (!result.isNull) work.own(result);
   }
   if (result.isNull) throw new Error("No se creó el temporal " + tag + ".");
   MF_identitySTF(result.mainView);
   return result;
}
function MF_lightness(window, work, tag)
{
   if (!window.mainView.image.isColor) return window;
   var id = MF_unique(tag), p = new ChannelExtraction, result = null;
   p.colorSpace = ChannelExtraction.CIELab;
   p.channels = [[true,id],[false,""],[false,""]];
   p.sampleFormat = ChannelExtraction.SameAsSource;
   try
   {
      if (!p.executeOn(window.mainView)) throw new Error("No se pudo extraer CIE L*.");
   }
   finally
   {
      result = ImageWindow.windowById(id);
      if (!result.isNull) { work.own(result); result.hide(); }
   }
   if (result.isNull) throw new Error("No se generó la componente CIE L*.");
   return result;
}
function MF_blur(window, sigma, work, tag)
{
   if (sigma === 0) return window;
   var result = MF_clone(window.mainView, work, tag), p = new Convolution;
   p.mode = Convolution.Parametric;
   p.sigma = sigma;
   p.shape = 2;
   p.aspectRatio = 1;
   p.rotationAngle = 0;
   if (!p.executeOn(result.mainView)) throw new Error("No se pudo calcular el suavizado de " + tag + ".");
   return result;
}
function MF_normalizedBlur(weighted, maskBlur, sigma, work, tag)
{
   var blurred = MF_blur(weighted, sigma, work, tag + "G");
   var out = MF_math(blurred.mainView.id + "/max(" + maskBlur.mainView.id + ",1e-6)",
                     weighted.mainView, work, tag, false);
   if (blurred !== weighted) work.close(blurred);
   return out;
}

// Ajuste de contraste sobre estructuras grandes, no una calibración fotométrica.
function MF_fitGain(pairs)
{
   var data = pairs.filter(function(p) { return isFinite(p[0]) && isFinite(p[1]); });
   var fallback = {gain:1, offset:0, reliable:false, count:data.length, r2:0};
   if (data.length < 32) return fallback;
   function median(values)
   {
      values.sort(function(a,b) { return a-b; });
      var n = values.length, i = Math.floor(n/2);
      return n % 2 ? values[i] : (values[i-1] + values[i])/2;
   }
   var fit;
   for (var iteration = 0; iteration < 3; ++iteration)
   {
      var mx=0, my=0, xx=0, yy=0, xy=0, n=data.length;
      for (var i=0; i<n; ++i) { mx+=data[i][0]/n; my+=data[i][1]/n; }
      for (var j=0; j<n; ++j)
      {
         var dx=data[j][0]-mx, dy=data[j][1]-my;
         xx+=dx*dx; yy+=dy*dy; xy+=dx*dy;
      }
      if (xx < 1e-10 || yy < 1e-10) return fallback;
      var gain=xy/xx, offset=my-gain*mx, r2=xy*xy/(xx*yy);
      if (!isFinite(gain) || gain < 0.1 || gain > 10 || r2 < 0.25) return fallback;
      fit={gain:gain,offset:offset,reliable:true,count:n,r2:r2};
      var residuals=data.map(function(p) { return p[1]-gain*p[0]-offset; });
      var center=median(residuals.slice());
      var mad=median(residuals.map(function(r) { return Math.abs(r-center); }));
      if (mad < 1e-8) break;
      var limit=3.5*1.4826*mad;
      var kept=data.filter(function(p) { return Math.abs(p[1]-gain*p[0]-offset-center) <= limit; });
      if (kept.length < 32 || kept.length === n || iteration === 2) break;
      data=kept;
   }
   return fit || fallback;
}
function MF_samplePairs(base, detail, mask)
{
   var w=base.width, h=base.height, pairs=[];
   var step=Math.max(1,Math.ceil(Math.sqrt(w*h/6400)));
   for (var y=Math.floor(step/2); y<h; y+=step)
      for (var x=Math.floor(step/2); x<w; x+=step)
         if (mask.sample(x,y,0) > 0.75)
            pairs.push([detail.sample(x,y,0),base.sample(x,y,0)]);
   return pairs;
}
function MF_prepare(config, progress)
{
   MF_validate(config);
   var work=new MF_Work;
   function step(text) { if (progress) progress(text); }
   try
   {
      step("Copiando las imágenes sin modificar los originales…");
      var base=MF_clone(config.base,work,"Base");
      MF_copyMetadata(config.base.window,base);
      var detail=MF_clone(config.detail,work,"Detalle");
      var mask=MF_clone(config.mask,work,"Mascara");
      var lbase=MF_lightness(base,work,"BaseL"), ldetail=MF_lightness(detail,work,"DetalleL");
      // El usuario aporta la geometría: no se interpreta un píxel negro como falta de cobertura.
      var support=MF_math("min(1,max(0,"+mask.mainView.id+"))",mask.mainView,work,"Cobertura",false);
      var feather=MF_blur(support,config.feather,work,"Transicion");
      var effective=config.feather===0 ? support :
         MF_math(support.mainView.id+"*min(1,max(0,("+feather.mainView.id+"-0.5)*2))",
            support.mainView,work,"MascaraFinal",false);
      step("Calculando las escalas de detalle y su transición…");
      var maskFine=MF_blur(support,config.fine,work,"MaskFina");
      var maskCoarse=MF_blur(support,config.coarse,work,"MaskGruesa");
      var wb=MF_math(lbase.mainView.id+"*"+support.mainView.id,lbase.mainView,work,"BaseP",false);
      var wd=MF_math(ldetail.mainView.id+"*"+support.mainView.id,ldetail.mainView,work,"DetalleP",false);
      var bf=MF_normalizedBlur(wb,maskFine,config.fine,work,"BaseFina");
      var bc=MF_normalizedBlur(wb,maskCoarse,config.coarse,work,"BaseGruesa");
      var df=MF_normalizedBlur(wd,maskFine,config.fine,work,"DetalleFino");
      var dc=MF_normalizedBlur(wd,maskCoarse,config.coarse,work,"DetalleGrueso");
      var pairs=MF_samplePairs(bc.mainView.image,dc.mainView.image,effective.mainView.image);
      if (pairs.length < 32)
         throw new Error("La máscara no contiene suficiente zona interior válida. Revisa su cobertura y reduce la transición si el campo es pequeño.");
      var fit=config.autoGain ? MF_fitGain(pairs) : {gain:1,reliable:true,count:pairs.length,r2:1};
      var baseBand=MF_math(bf.mainView.id+"-"+bc.mainView.id,bf.mainView,work,"BandaBase",false);
      var detailBand=MF_math(df.mainView.id+"-"+dc.mainView.id,df.mainView,work,"BandaDetalle",false);
      var retained=[base,lbase,effective,baseBand,detailBand];
      work.windows.slice().forEach(function(window) { if (retained.indexOf(window)<0) work.close(window); });
      return {work:work,base:base,lightness:lbase,mask:effective,baseBand:baseBand,detailBand:detailBand,
         fit:fit,config:config,result:null,accepted:false,amount:null,gain:null};
   }
   catch (e) { work.dispose(); throw e; }
}
function MF_update(state, amount, gain, checkCandidate)
{
   amount=MF_number(amount,"Intensidad",0,1);
   gain=MF_number(gain,"Ganancia relativa",0.1,4);
   var work=state.work, before=work.windows.slice(), candidate=null;
   try
   {
      if (amount === 0) candidate=MF_clone(state.base.mainView,work,"Resultado");
      else
      {
         var l=state.lightness.mainView.id, m=state.mask.mainView.id;
         var expression="min(1,max(0,"+l+"+"+amount+"*"+m+"*("+(gain*state.fit.gain)+"*"+
            state.detailBand.mainView.id+"-"+state.baseBand.mainView.id+")))";
         var newL=MF_math(expression,state.lightness.mainView,work,"NuevaL",false);
         if (state.base.mainView.image.isColor)
         {
            var mixed=MF_clone(state.base.mainView,work,"Color");
            var p=new LRGBCombination;
            // Orden del proceso nativo: R, G, B, L.
            p.channels=[[false,"",1],[false,"",1],[false,"",1],[true,newL.mainView.id,1]];
            p.mL=0.5; p.mc=0.5; p.noiseReduction=false; p.clipHighlights=false;
            if (!p.executeOn(mixed.mainView)) throw new Error("No se pudo incorporar la nueva luminosidad al color base.");
            // Evita que una conversión de color cambie el exterior negro de la máscara.
            candidate=MF_math("iif("+m+">0,"+mixed.mainView.id+","+state.base.mainView.id+")",
               state.base.mainView,work,"Resultado",true);
         }
         else
            candidate=MF_math("iif("+m+">0,"+newL.mainView.id+","+state.base.mainView.id+")",
               state.base.mainView,work,"Resultado",false);
      }
      MF_copyMetadata(state.base,candidate);
      MF_identitySTF(candidate.mainView);
      if (checkCandidate) checkCandidate(candidate);
      var previous=state.result;
      state.result=candidate; state.amount=amount; state.gain=gain;
      if (previous) work.close(previous);
      return candidate;
   }
   finally
   {
      work.windows.slice().forEach(function(window)
      {
         if (before.indexOf(window)<0 && window!==state.result) work.close(window);
      });
   }
}
function MF_accept(state, id, amount, gain)
{
   MF_validId(id);
   if (!state.result || state.result.isNull || amount!==state.amount || gain!==state.gain)
      throw new Error("Actualiza la comparación con los valores elegidos antes de conservar el resultado.");
   if (!ImageWindow.windowById(id).isNull && ImageWindow.windowById(id).mainView.id!==state.result.mainView.id)
      throw new Error("Ya existe una imagen llamada "+id+".");
   state.result.mainView.id=id;
   state.result.show();
   state.accepted=true;
   state.work.release(state.result);
   return state.result;
}

// Geometría de previsualización compartida entre los dos paneles.
function MF_Camera(width,height)
{
   this.width=width; this.height=height; this.x=width/2; this.y=height/2;
   this.scale=1; this.fitted=true;
}
MF_Camera.prototype.fit=function(w,h)
{
   this.scale=Math.min(w/this.width,h/this.height,1);
   this.x=this.width/2; this.y=this.height/2; this.fitted=true;
};
MF_Camera.prototype.limit=function(w,h)
{
   var hx=w/(2*this.scale),hy=h/(2*this.scale);
   this.x=hx>=this.width/2?this.width/2:MF_clamp(this.x,hx,this.width-hx);
   this.y=hy>=this.height/2?this.height/2:MF_clamp(this.y,hy,this.height-hy);
};
MF_Camera.prototype.zoom=function(factor,x,y,w,h)
{
   var ix=this.x+(x-w/2)/this.scale,iy=this.y+(y-h/2)/this.scale;
   this.scale=MF_clamp(this.scale*factor,0.01,8); this.fitted=false;
   this.x=ix-(x-w/2)/this.scale; this.y=iy-(y-h/2)/this.scale;
   this.limit(w,h);
};
MF_Camera.prototype.pan=function(dx,dy,w,h)
{
   this.x-=dx/this.scale; this.y-=dy/this.scale; this.fitted=false; this.limit(w,h);
};

var MF_HELP = "MEZCLA DE FOCALES · "+MF_VERSION+" (desarrollo)\n\n"+
   "Entradas: base de gran campo, detalle de focal larga y máscara monocroma de cobertura.\n"+
   "Las tres deben estar registradas y tener las mismas dimensiones. Las imágenes deben estar estiradas y sin estrellas.\n\n"+
   "La base determina dimensiones y escala de salida. Para conservar el muestreo de la focal larga, prepara previamente una cuadrícula que lo conserve. Ampliar la base no crea detalle fuera del campo de la focal larga.\n\n"+
   "La máscara debe ser blanca solo donde existe detalle válido y negra fuera; no uses la luminancia de la nebulosa como sustituto de la cobertura. Puedes dibujar un rectángulo interior al campo válido y suavizarlo. Los bordes negros de la imagen de detalle no se detectan automáticamente.\n\n"+
   "Sigma menor y mayor seleccionan una banda por diferencia de gaussianas. Son desviaciones estándar, en píxeles de salida, no tamaños exactos de estructuras ni capas MLT. Menor=0 incluye los píxeles más finos y puede incorporar más ruido. Empieza con 1 y 4.\n\n"+
   "La transición suaviza la cobertura sin extenderla fuera de la máscara. El ajuste automático compara el contraste de estructuras grandes dentro de la máscara; si no es fiable usa ganancia 1 y muestra un aviso. No es una calibración fotométrica y puede ser inadecuado para filtros o estirados muy distintos.\n\n"+
   "La intensidad interpola entre el detalle base y el detalle de focal larga en la banda elegida; no suma sin más dos versiones del mismo detalle. La ganancia relativa corrige la amplitud del detalle. Las estructuras grandes de la base se mantienen en la componente de trabajo.\n\n"+
   "En RGB se utiliza CIE L* y una combinación LRGB neutra, conservando como origen del color la base. Cambiar la luminosidad puede producir colores fuera de gama; no es una garantía de color fotométrico. La nueva L* se limita a 0–1.\n\n"+
   "La comparación se calcula a resolución completa. Rueda y arrastre sincronizan zoom y desplazamiento. La visualización usa un bitmap de pantalla: revisa el resultado en PixInsight al conservarlo. No se aplica STF adicional.\n\n"+
   "Las comparaciones no acumulan cambios: parten siempre de las copias iniciales. Si modificas los originales, vuelve y prepara otra vez. Aceptar conserva el resultado ya calculado. Cerrar o Volver elimina solo los temporales propiedad del script. No se guardan archivos automáticamente.\n\n"+
   "Objetivo: PixInsight con motor V8. Esta versión requiere comprobación en una instalación real de PixInsight; no se ha ejecutado aquí el motor nativo.\n\nCopyright © Carlos Rincón 2026";

function MF_label(parent,text)
{
   var label=new Label(parent); label.text=text; label.wordWrapping=true; return label;
}
function MF_help()
{
   var dialog=new Dialog; dialog.windowTitle="Mezcla de focales · ayuda";
   var text=new TextBox(dialog); text.readOnly=true; text.text=MF_HELP; text.setScaledMinSize(620,420);
   var close=new PushButton(dialog); close.text="Cerrar"; close.onClick=function() { dialog.ok(); };
   var row=new HorizontalSizer; row.addStretch(); row.add(close);
   dialog.sizer=new VerticalSizer; dialog.sizer.margin=10; dialog.sizer.spacing=8;
   dialog.sizer.add(text,100); dialog.sizer.add(row); dialog.adjustToContents(); dialog.execute();
}

class MF_SetupDialog extends Dialog
{
constructor()
{
   super();
   var self=this;
   this.windowTitle="Mezcla de focales · "+MF_VERSION+" · desarrollo";
   this.base=new ViewList(this); this.detail=new ViewList(this); this.mask=new ViewList(this);
   this.lists=[this.base,this.detail,this.mask];
   this.lists.forEach(function(list) { list.getMainViews(); });
   function refreshViews()
   {
      var old=self.lists.map(function(list) { return list.currentView; });
      self.lists.forEach(function(list,i)
      {
         list.getMainViews();
         if (old[i] && !old[i].isNull) list.currentView=old[i];
      });
   }
   function imageRow(title,list)
   {
      var button=new PushButton(self); button.text="Abrir archivo…";
      button.onClick=function()
      {
         try
         {
            var picker=new OpenFileDialog; picker.multipleSelections=false; picker.loadImageFilters();
            if (!picker.execute()) return;
            var windows=ImageWindow.open(picker.fileName,"","",true);
            if (windows.length!==1)
            {
               windows.forEach(function(window) { window.forceClose(); });
               throw new Error("Selecciona un archivo que contenga una sola imagen.");
            }
            windows[0].show(); refreshViews(); list.currentView=windows[0].mainView;
            self.prepared.checked=false;
         }
         catch (e) { new MessageBox(String(e),"Abrir imagen",StdIcon_Error,StdButton_Ok).execute(); }
      };
      var row=new HorizontalSizer; row.spacing=8; row.add(MF_label(self,title)); row.add(list,100); row.add(button);
      return row;
   }
   this.fine=new SpinBox(this); this.fine.minValue=0; this.fine.maxValue=16; this.fine.value=1;
   this.coarse=new SpinBox(this); this.coarse.minValue=1; this.coarse.maxValue=64; this.coarse.value=4;
   this.feather=new SpinBox(this); this.feather.minValue=0; this.feather.maxValue=256; this.feather.value=32;
   this.fine.toolTip="Sigma menor en píxeles de salida. 0 incluye el detalle más fino y también su ruido.";
   this.coarse.toolTip="Sigma mayor: junto con sigma menor determina la banda de detalle por diferencia de gaussianas.";
   this.feather.toolTip="Sigma de transición en píxeles. Se mantiene negro el exterior de la máscara. 0 respeta la máscara sin suavizado adicional.";
   var scales=new HorizontalSizer; scales.spacing=8;
   scales.add(MF_label(this,"Sigma menor:")); scales.add(this.fine);
   scales.add(MF_label(this,"Sigma mayor:")); scales.add(this.coarse);
   scales.add(MF_label(this,"Transición:")); scales.add(this.feather); scales.addStretch();
   this.autoGain=new CheckBox(this); this.autoGain.text="Estimar la ganancia de contraste dentro de la cobertura"; this.autoGain.checked=true;
   this.outputName=new Edit(this); this.outputName.text="Mezcla_Focales";
   var nameRow=new HorizontalSizer; nameRow.spacing=8; nameRow.add(MF_label(this,"Nombre del resultado:")); nameRow.add(this.outputName,100);
   this.prepared=new CheckBox(this);
   this.prepared.text="Confirmo: imágenes estiradas, sin estrellas y registradas; máscara limitada a cobertura válida";
   this.prepared.toolTip="Se comprueban dimensiones y canales, pero no el registro real ni la eliminación de estrellas ni el estado lineal.";
   this.lists.forEach(function(list) { list.onViewSelected=function() { self.prepared.checked=false; }; });
   var help=new PushButton(this); help.text="Ayuda"; help.onClick=MF_help;
   var refresh=new PushButton(this); refresh.text="Actualizar listas"; refresh.onClick=refreshViews;
   var run=new PushButton(this); run.text="Preparar comparación";
   run.onClick=function()
   {
      try
      {
         self.config={base:self.base.currentView,detail:self.detail.currentView,mask:self.mask.currentView,
            fine:self.fine.value,coarse:self.coarse.value,feather:self.feather.value,
            autoGain:self.autoGain.checked,id:self.outputName.text.trim(),prepared:self.prepared.checked};
         MF_validate(self.config); self.ok();
      }
      catch (e) { new MessageBox(String(e),"Revisar entradas",StdIcon_Warning,StdButton_Ok).execute(); }
   };
   var cancel=new PushButton(this); cancel.text="Cerrar"; cancel.onClick=function() { self.cancel(); };
   var buttons=new HorizontalSizer; buttons.spacing=8;
   buttons.add(help); buttons.add(refresh); buttons.addStretch(); buttons.add(run); buttons.add(cancel);
   this.sizer=new VerticalSizer; this.sizer.margin=12; this.sizer.spacing=10;
   this.sizer.add(MF_label(this,"Combina detalle de focal larga con una base de gran campo ya estirada y sin estrellas. El color procede de la base. No se aplica STF."));
   this.sizer.add(imageRow("Base:",this.base));
   this.sizer.add(imageRow("Detalle:",this.detail));
   this.sizer.add(imageRow("Máscara:",this.mask));
   this.sizer.add(MF_label(this,"Las tres imágenes deben compartir dimensiones, orientación y posición. La base fija la resolución de salida. Blanco en la máscara = detalle válido; negro = conservar la base."));
   this.sizer.add(scales); this.sizer.add(this.autoGain); this.sizer.add(nameRow);
   this.sizer.add(this.prepared); this.sizer.add(buttons);
   this.setScaledMinWidth(760); this.adjustToContents();
}
}

class MF_PreviewDialog extends Dialog
{
constructor(state)
{
   super();
   var self=this; this.state=state; this.returnToSetup=false; this.ready=false; this.busy=false;
   this.windowTitle="Mezcla de focales · comparación sin STF · "+MF_VERSION;
   this.camera=new MF_Camera(state.base.mainView.image.width,state.base.mainView.image.height);
   this.originalBitmap=state.base.mainView.image.render(); this.resultBitmap=null;
   this.originalPane=this.makePane(); this.resultPane=this.makePane();
   var left=new VerticalSizer; left.spacing=4; left.add(MF_label(this,"Base · "+state.config.base.id)); left.add(this.originalPane,100);
   var right=new VerticalSizer; right.spacing=4; right.add(MF_label(this,"Resultado de la mezcla")); right.add(this.resultPane,100);
   var columns=new HorizontalSizer; columns.spacing=8; columns.add(left,100); columns.add(right,100);
   this.amount=new Slider(this); this.amount.setRange(0,100); this.amount.value=35;
   this.amountEdit=new Edit(this); this.amountEdit.text="35"; this.amountEdit.setScaledFixedWidth(65);
   this.gain=new Slider(this); this.gain.setRange(10,400); this.gain.value=100;
   this.gainEdit=new Edit(this); this.gainEdit.text="1.00"; this.gainEdit.setScaledFixedWidth(65);
   this.amount.onValueUpdated=function(value) { self.amountEdit.text=String(value); self.freshness(); };
   this.gain.onValueUpdated=function(value) { self.gainEdit.text=(value/100).toFixed(2); self.freshness(); };
   this.amountEdit.onEditCompleted=function()
   {
      try { self.amount.value=Math.round(MF_number(self.amountEdit.text,"Intensidad",0,100)); }
      catch (e) { self.status.text=String(e); }
      self.freshness();
   };
   this.gainEdit.onEditCompleted=function()
   {
      try { self.gain.value=Math.round(100*MF_number(self.gainEdit.text,"Ganancia",0.1,4)); }
      catch (e) { self.status.text=String(e); }
      self.freshness();
   };
   var amountRow=new HorizontalSizer; amountRow.spacing=8; amountRow.add(MF_label(this,"Intensidad (%):")); amountRow.add(this.amount,100); amountRow.add(this.amountEdit);
   var gainRow=new HorizontalSizer; gainRow.spacing=8; gainRow.add(MF_label(this,"Ganancia relativa del detalle:")); gainRow.add(this.gain,100); gainRow.add(this.gainEdit);
   this.updateButton=new PushButton(this); this.updateButton.text="Actualizar comparación";
   this.updateButton.onClick=function() { self.calculate(); };
   var fit=new PushButton(this); fit.text="Campo completo"; fit.onClick=function() { self.fit(); };
   var one=new PushButton(this); one.text="100 %"; one.onClick=function()
   {
      self.camera.scale=1; self.camera.fitted=false; self.camera.limit(self.originalPane.width,self.originalPane.height); self.repaintBoth();
   };
   var minus=new PushButton(this); minus.text="−"; minus.onClick=function() { self.zoomAtCenter(1/1.25); };
   var plus=new PushButton(this); plus.text="+"; plus.onClick=function() { self.zoomAtCenter(1.25); };
   this.zoomLabel=MF_label(this,"");
   var navigation=new HorizontalSizer; navigation.spacing=8; navigation.add(fit); navigation.add(one); navigation.add(minus); navigation.add(plus); navigation.add(this.zoomLabel); navigation.addStretch(); navigation.add(this.updateButton);
   this.status=MF_label(this,"");
   this.outputName=new Edit(this); this.outputName.text=state.config.id;
   var nameRow=new HorizontalSizer; nameRow.spacing=8; nameRow.add(MF_label(this,"Nombre de salida:")); nameRow.add(this.outputName,100);
   this.acceptButton=new PushButton(this); this.acceptButton.text="Conservar resultado"; this.acceptButton.enabled=false;
   this.acceptButton.onClick=function()
   {
      try
      {
         var values=self.values();
         if (!self.ready) throw new Error("Actualiza la comparación antes de conservar el resultado.");
         MF_accept(state,self.outputName.text.trim(),values.amount,values.gain); self.ok();
      }
      catch (e) { new MessageBox(String(e),"Conservar resultado",StdIcon_Warning,StdButton_Ok).execute(); }
   };
   this.backButton=new PushButton(this); this.backButton.text="Volver";
   this.backButton.onClick=function() { self.returnToSetup=true; self.cancel(); };
   this.closeButton=new PushButton(this); this.closeButton.text="Descartar y cerrar";
   this.closeButton.onClick=function() { self.returnToSetup=false; self.cancel(); };
   var help=new PushButton(this); help.text="Ayuda"; help.onClick=MF_help;
   var buttons=new HorizontalSizer; buttons.spacing=8; buttons.add(this.backButton); buttons.add(help); buttons.addStretch(); buttons.add(this.acceptButton); buttons.add(this.closeButton);
   this.sizer=new VerticalSizer; this.sizer.margin=10; this.sizer.spacing=8;
   this.sizer.add(amountRow); this.sizer.add(gainRow); this.sizer.add(navigation);
   this.sizer.add(columns,100); this.sizer.add(this.status); this.sizer.add(nameRow); this.sizer.add(buttons);
   this.sizer.add(MF_label(this,"Rueda: zoom en ambos paneles. Arrastrar: desplazar. Las actualizaciones parten siempre de la misma base. Vista de pantalla sin STF; cálculo a resolución completa."));
   this.setScaledMinSize(940,620); this.adjustToContents(); this.fit(); this.calculate();
}
values()
{
   return {amount:MF_number(this.amountEdit.text,"Intensidad",0,100)/100,
           gain:MF_number(this.gainEdit.text,"Ganancia relativa",0.1,4)};
}
freshness(quiet)
{
   var fresh=false;
   try { var v=this.values(); fresh=this.ready && !!this.state.result && v.amount===this.state.amount && v.gain===this.state.gain; }
   catch (e) {}
   this.acceptButton.enabled=fresh && !this.busy;
   if (!quiet && this.ready && !fresh && !this.busy) this.status.text="Ajustes modificados: pulsa Actualizar comparación.";
}
setBusy(value)
{
   this.busy=value;
   [this.updateButton,this.backButton,this.closeButton,this.amount,this.amountEdit,this.gain,this.gainEdit].forEach(function(control) { control.enabled=!value; });
   this.freshness(true);
}
calculate()
{
   var self=this; this.setBusy(true);
   try
   {
      var v=this.values(), bitmap=null;
      this.status.text="Calculando la nueva luminosidad y preparando la comparación…";
      CoreApplication.processEvents();
      MF_update(this.state,v.amount,v.gain,function(candidate) { bitmap=candidate.mainView.image.render(); });
      this.resultBitmap=bitmap; this.ready=true; this.repaintBoth();
      var f=this.state.fit;
      this.status.text="Comparación calculada · intensidad "+(v.amount*100).toFixed(1)+" % · ganancia total "+(f.gain*v.gain).toFixed(3)+
         (f.reliable?"":" · Ajuste automático no fiable: se ha usado ganancia inicial 1. Revisa el resultado.");
      console.writeln(this.status.text);
   }
   catch (e)
   {
      this.status.text="Error: "+String(e)+(this.ready?" Se conserva la última comparación válida.":"");
      console.warningln(this.status.text);
   }
   finally { this.setBusy(false); }
}
fit()
{
   this.camera.fit(Math.min(this.originalPane.width,this.resultPane.width),Math.min(this.originalPane.height,this.resultPane.height));
   this.repaintBoth();
}
zoomAtCenter(factor)
{
   var pane=this.originalPane;
   this.camera.zoom(factor,pane.width/2,pane.height/2,pane.width,pane.height); this.repaintBoth();
}
repaintBoth()
{
   this.originalPane.update(); this.resultPane.update();
   if (this.zoomLabel) this.zoomLabel.text="Zoom "+(this.camera.scale*100).toFixed(1)+" %";
}
makePane()
{
   var self=this, pane=new Control(this); pane.setScaledMinSize(350,300); pane.drag=null;
   pane.onPaint=function()
   {
      var bitmap=this===self.originalPane?self.originalBitmap:self.resultBitmap;
      var g=new Graphics(this);
      try
      {
         g.fillRect(0,0,this.width,this.height,new Brush(0xff202020));
         if (!bitmap) return;
         var s=self.camera.scale,ox=this.width/2-self.camera.x*s,oy=this.height/2-self.camera.y*s;
         var x0=Math.max(0,Math.floor(-ox/s)),y0=Math.max(0,Math.floor(-oy/s));
         var x1=Math.min(bitmap.width,Math.ceil((this.width-ox)/s)),y1=Math.min(bitmap.height,Math.ceil((this.height-oy)/s));
         if (x1>x0 && y1>y0)
         {
            g.smoothInterpolation=s<1;
            g.drawScaledBitmapRect(ox+x0*s,oy+y0*s,ox+x1*s,oy+y1*s,bitmap,x0,y0,x1,y1);
         }
      }
      finally { g.end(); }
   };
   pane.onMouseWheel=function(x,y,delta)
   {
      if (!delta) return;
      self.camera.zoom(delta>0?1.25:1/1.25,x,y,this.width,this.height); self.repaintBoth();
   };
   pane.onMousePress=function(x,y,button)
   {
      if (button===MouseButton.Left) this.drag={x:x,y:y};
   };
   pane.onMouseMove=function(x,y,buttons)
   {
      if (!this.drag) return;
      if (!(buttons & MouseButton.Left)) { this.drag=null; return; }
      self.camera.pan(x-this.drag.x,y-this.drag.y,this.width,this.height);
      this.drag={x:x,y:y}; self.repaintBoth();
   };
   pane.onMouseRelease=function() { this.drag=null; };
   pane.onResize=function()
   {
      if (!self.originalPane || !self.resultPane) return;
      if (self.camera.fitted) self.fit();
      else { self.camera.limit(this.width,this.height); self.repaintBoth(); }
   };
   return pane;
}
}

function MF_main()
{
   console.show();
   var setup=new MF_SetupDialog;
   while (setup.execute())
   {
      var state=null;
      try
      {
         state=MF_prepare(setup.config,function(text) { console.writeln(text); CoreApplication.processEvents(); });
         console.writeln("Escalas Gaussianas: sigma "+setup.config.fine+"–"+setup.config.coarse+" px; transición "+setup.config.feather+" px; ganancia estimada "+state.fit.gain.toFixed(4));
         var preview=new MF_PreviewDialog(state);
         if (preview.execute()) return;
         if (!preview.returnToSetup) return;
      }
      catch (e) { new MessageBox(String(e),"Mezcla de focales",StdIcon_Error,StdButton_Ok).execute(); }
      finally { if (state) state.work.dispose(); }
   }
}

#ifndef CR_MF_LIBRARY
try { MF_main(); }
catch (e) { new MessageBox(String(e),"Mezcla de focales",StdIcon_Error,StdButton_Ok).execute(); }
#endif
