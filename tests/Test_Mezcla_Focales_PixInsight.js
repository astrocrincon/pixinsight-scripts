// Prueba nativa opcional. Ejecutar desde el editor de scripts de PixInsight.
// Descarga el repositorio completo para conservar esta ruta relativa.
#engine v8
#define CR_MF_LIBRARY
#include "../src/scripts/crinconlab/Mezcla_Focales.js"

function MF_nativeTests()
{
   var fixtures=new MF_Work, state=null, accepted=null;
   function check(condition,message) { if (!condition) throw new Error("FAIL: "+message); }
   function make(tag,channels)
   {
      return fixtures.own(new ImageWindow(64,64,channels,32,true,channels===3,MF_unique("Test_"+tag)));
   }
   function fill(window,values)
   {
      window.mainView.beginProcess();
      try
      {
         var image=window.mainView.image;
         for (var c=0;c<values.length;++c) { image.selectedChannel=c; image.fill(values[c]); }
         image.resetSelections();
      }
      finally { window.mainView.endProcess(); }
   }
   function formula(window,expression)
   {
      var p=new PixelMath;
      p.expression=expression; p.useSingleExpression=true; p.createNewImage=false;
      p.rescale=false; p.truncate=false;
      check(p.executeOn(window.mainView),"PixelMath de preparación");
   }
   console.show();
   try
   {
      var base=make("BaseRGB",3),detail=make("Detalle",1),mask=make("Mascara",1);
      fill(base,[0.2,0.3,0.4]);
      formula(detail,"0.35+0.03*sin(x()*0.8)+0.02*cos(y()*0.7)");
      formula(mask,"iif(x()>10 && x()<54 && y()>10 && y()<54,1,0)");
      base.mainView.image.selectedChannel=2;
      base.mainView.image.selectedRect=new Rect(5,7,24,26);
      var config={base:base.mainView,detail:detail.mainView,mask:mask.mainView,
         fine:1,coarse:4,feather:2,autoGain:false,id:MF_unique("Test_Salida"),prepared:true};
      state=MF_prepare(config);
      check(base.mainView.image.selectedChannel===2,"restaurar canal seleccionado");
      var rect=base.mainView.image.selectedRect;
      check(rect.x0===5 && rect.y0===7 && rect.x1===24 && rect.y1===26,"restaurar selección rectangular");
      var zero=MF_update(state,0,1);
      for (var c=0;c<3;++c)
      {
         check(Math.abs(zero.mainView.image.sample(0,0,c)-base.mainView.image.sample(0,0,c))<1e-7,"intensidad cero, campo completo");
         check(Math.abs(zero.mainView.image.sample(32,32,c)-base.mainView.image.sample(32,32,c))<1e-7,"intensidad cero, centro");
      }
      var first=MF_update(state,0.6,1),samples=[];
      for (var channel=0;channel<3;++channel)
      {
         check(Math.abs(first.mainView.image.sample(2,2,channel)-base.mainView.image.sample(2,2,channel))<1e-7,"exterior de máscara");
         samples.push(first.mainView.image.sample(31,29,channel));
      }
      check(samples.some(function(value,i) { return Math.abs(value-base.mainView.image.sample(31,29,i))>1e-6; }),"incorporar detalle por LRGB nativo");
      MF_update(state,0.2,1.4);
      var repeated=MF_update(state,0.6,1);
      for (var i=0;i<3;++i)
         check(Math.abs(samples[i]-repeated.mainView.image.sample(31,29,i))<1e-6,"no acumular ensayos");
      var blocked=false;
      try { MF_accept(state,config.id,0.7,1); } catch (e) { blocked=true; }
      check(blocked,"bloquear aceptación desactualizada");
      accepted=MF_accept(state,config.id,0.6,1);
      state.work.dispose();
      check(!accepted.isNull,"conservar resultado aceptado tras limpiar temporales");
      check(!base.isNull && !detail.isNull && !mask.isNull,"conservar entradas");
      console.writeln("PASS: procesos nativos, máscara, selección completa, intensidad cero, ensayos independientes y aceptación.");
      new MessageBox("Pruebas sintéticas completadas. Falta revisar la interfaz y los datos astronómicos reales.","Mezcla de focales",StdIcon_Information,StdButton_Ok).execute();
   }
   finally
   {
      if (state) state.work.dispose();
      if (accepted && !accepted.isNull) accepted.forceClose();
      fixtures.dispose();
   }
}
try { MF_nativeTests(); }
catch (e) { console.criticalln(String(e)); new MessageBox(String(e),"Prueba nativa de mezcla",StdIcon_Error,StdButton_Ok).execute(); }
