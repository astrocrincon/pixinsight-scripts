// Copyright © Carlos Rincón 2026
#feature-id Utilities > RGB DualBand Solver SPCC
#feature-info Composicion RGB + Dual Band, Image Solver y SPCC. Version 0.13.
#engine v8
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdButton.jsh>
CoreApplication.ensureMinimumVersion(1,9,5);
#define VERSION "6.5.0"
#define TITLE "ImageSolver"
#define SOLVER_SETTINGS_MODULE "ImageSolver"
#define SETTINGS_MODULE "ImageSolver"
#include <pjsr/astrometry/AstrometricMetadata.js>
#include <pjsr/astrometry/AstronomicalCatalogs.js>
#include <pjsr/astrometry/SearchCoordinatesDialog.js>
#include <pjsr/astrometry/CatalogDownloaderDialog.js>
#include <pjsr/astrometry/ProjectionConfigurationDialog.js>
#include <pjsr/astrometry/UtilityControls.js>
#include <pjsr/astrometry/VizierMirrorDialog.js>
#include <pjsr/controls/DateTimeEditor.js>
#include <pjsr/controls/GeodeticCoordinatesEditor.js>
#include <../src/scripts/ImageSolver/ImageSolverDialog.js>
#include <../src/scripts/ImageSolver/ImageSolverEngine.js>

var RD_HELP_TEXT="RGB + DUAL BAND → IMAGE SOLVER → SPCC — VERSIÓN 0.13\nCopyright © Carlos Rincón 2026\n\nQUÉ HACE\nCrea una imagen nueva con PixelMath, hereda la solución astrométrica del RGB\no Dual Band y aplica SPCC. Si ninguna tiene solución, abre Image Solver. No modifica los archivos de origen\nni guarda el resultado automáticamente.\n\nREQUISITOS\n• PixInsight 1.9.5 con ImageSolver 6.5.0 instalado en src/scripts/ImageSolver.\n• SPCC y el catálogo GaiaDR3SP instalados y configurados en PixInsight.\n• Imagen RGB lineal y una Dual Band lineal, monocroma o RGB.\n• Ambas imágenes alineadas/registradas entre sí y con las mismas dimensiones.\n• Gradientes eliminados previamente en las imágenes de partida.\n• Calibración de color realizada previamente en ambas imágenes: RGB y Dual Band.\n• Opcional: reducción de ruido previa con ML Denoise.\nUn STF de visualización está permitido, pero las imágenes deben seguir lineales.\nEstos pasos se realizan antes de ejecutar el script. El script no alinea,\nno elimina gradientes, no aplica ML Denoise ni iguala las intensidades de entrada.\nLa casilla de confirmación declara esa preparación; no la verifica automáticamente.\nLa calibración SPCC del resultado se mantiene como etapa posterior a la mezcla.\n\nPASO A PASO (LOS MISMOS NÚMEROS QUE EN LAS VENTANAS)\n1. Prepara las dos imágenes: lineales, alineadas, sin gradientes y con\n   calibración de color previa en ambas. ML Denoise es opcional.\n2. Selecciona la imagen RGB, o ábrela con Abrir archivo….\n3. Selecciona la imagen Dual Band, o ábrela con Abrir archivo….\n4. Escribe el nombre de la imagen nueva.\n5. Revisa Configurar SPCC… y acepta sus ajustes.\n6. Marca la confirmación de preparación de las imágenes.\n7. Pulsa Abrir previsualización.\n8. En la nueva ventana aparece el control de intensidad, entre 1 y 5.\n   Empieza en 3; ajusta la intensidad que deseas evaluar.\n9. Pulsa Actualizar previsualización. Si ninguna entrada tiene solución válida,\n   se abre Image Solver para resolver una copia temporal del RGB.\n   Revisa sus datos. La solución del original no se modifica.\n   Se rehace la mezcla, se copia la solución y se ejecuta SPCC.\n10. Compara RGB original y resultado calibrado. Mismo STF está desactivado\n    por defecto; puedes activarlo. Para otra intensidad, repite 8 y 9.\n11. Revisa o cambia el nombre del resultado que vas a conservar.\n12. Pulsa Aceptar resultado. Se conserva esa imagen ya calibrada, sin repetir\n    PixelMath, Image Solver ni SPCC. Guárdala tú cuando quieras conservarla.\n\nFÓRMULA\nR = RGB[0] + k * Dual_Band[0]\nG = RGB[1]\nB = RGB[2]\n\nEn una Dual Band RGB se utiliza su canal rojo. Si es monocroma, su único canal.\nNo se realiza extracción de Ha/OIII ni sustracción de continuo.\nPixelMath crea datos reales de 32 bits, sin reescalar ni truncar a 0–1:\nlos valores superiores a 1 se conservan. Después SPCC puede cambiar los\nvalores de los tres canales al calibrar el color.\n\nINTENSIDAD DEL APORTE DUAL BAND\nEl control aparece únicamente en la pantalla de previsualización.\nPermite ajustar k entre 1 y 5 con un deslizador y un campo\nnumérico. El valor inicial es 3, como en la fórmula original.\n1 suma una vez el rojo de Dual Band; 3 suma tres veces ese canal; 5 suma\ncinco veces ese canal. No es un porcentaje de Ha ni iguala las intensidades de\nlas dos imágenes. El ajuste de intensidad vuelve a 3 al abrir el script;\nel botón de ajustes predeterminados sigue guardando únicamente SPCC.\n\nPREVISUALIZACIÓN CALIBRADA\nSe comparan lado a lado el RGB original y la composición calibrada con SPCC.\nAmbas vistas muestran el campo completo con el mismo encuadre. Esta primera\nversión no incluye zoom ni desplazamiento de la comparación.\n\nMismo STF para comparar el color está desactivado por defecto: cada vista\nutiliza su propio estirado automático enlazado. Esto puede producir diferencias\nde brillo entre ambas vistas. Al activarlo, se utiliza el estirado obtenido\ndel RGB para las dos. El STF solo cambia la visualización: no estira los datos\nlineales que conservarás al aceptar.\n\nCada actualización rehace la mezcla desde las entradas y vuelve a ejecutar\nSPCC. No acumula cambios de actualizaciones anteriores y no recalcula la\nastrometría mientras siga disponible la referencia temporal resuelta.\nLa operación puede tardar tanto como SPCC; no es una vista en tiempo real.\nPara evitar gráficas y archivos auxiliares en cada ensayo, se desactivan\nesas salidas durante la previsualización, sin cambiar los parámetros de color.\n\nSi cambias la intensidad, Aceptar resultado queda desactivado hasta actualizar.\nSi falla una actualización se conserva la última previsualización válida.\nLa intensidad mostrada debe coincidir con la del resultado para poder aceptarlo.\nCancelar cierra las imágenes temporales del script y conserva las entradas.\nLa aceptación conserva la imagen calibrada y le asigna el nombre elegido;\nno ejecuta una calibración adicional. Recibe un STF de visualización, pero\nsus datos siguen lineales y no se guardan automáticamente en disco.\n\nCONFIGURAR SPCC\nNo necesitas crear iconos de proceso. La ventana integrada permite elegir:\n• Filtros rojo, verde y azul.\n• Curva QE y referencia de blanco.\n• Magnitud límite automática o manual.\n• Neutralización del fondo y una vista de referencia opcional.\n• Generación de gráficas.\n\nLas curvas se leen de filters.xspd y white-references.xspd de PixInsight.\nLos valores iniciales son los predeterminados de SPCC: revísalos para tu equipo.\nPara curvas RGB de un sensor de color que ya incorporan su sensibilidad,\nutiliza Ideal QE curve. Las curvas personalizadas que solo estén en otras\nconfiguraciones no se importan automáticamente.\n\nAceptar aplica los cambios a la ejecución actual. Los parámetros avanzados\nque no aparecen en este diálogo conservan los valores iniciales de SPCC.\nEl catálogo GaiaDR3SP debe estar disponible en PixInsight; el script no lo\ninstala ni lo descarga.\n\nGUARDAR COMO PREDETERMINADOS\nEn Configurar SPCC, pulsa Guardar como predeterminados para reutilizar los\najustes al volver a abrir el script. Se almacenan en las preferencias de\nPixInsight. Para sustituirlos, vuelve a pulsar ese botón con otros ajustes.\nSe guardan filtros RGB, QE, blanco, magnitud automática/manual, neutralización\ndel fondo y generación de gráficas.\nLa vista de referencia del fondo no se guarda: pertenece a las imágenes\nabiertas de cada sesión y tendrás que seleccionarla de nuevo.\nSi las preferencias guardadas están incompletas o dañadas se usan las iniciales.\n\nAYUDA SIN IMÁGENES\nPuedes abrir Ayuda e instrucciones sin seleccionar ninguna imagen.\nEl manual está incluido en el propio .js: no necesita archivos adicionales.\nEl botón Guardar manual .txt… permite exportar estas instrucciones.\n\nCANCELACIONES Y ERRORES\n• Cancelar la ventana inicial no crea ninguna composición.\n• Cancelar Image Solver no ejecuta SPCC. Puedes actualizar otra vez o cancelar.\n• Una imagen sin solución astrométrica válida no pasa a SPCC.\n• Si falla SPCC se descarta ese intento y se conserva la última vista válida.\n• Cancelar la ventana de previsualización elimina las referencias/resultados\n  temporales que creó el script. Las imágenes originales no se cierran ni cambian.\n• Un cierre forzado de PixInsight puede dejar temporales abiertos.\n• No se sobrescriben archivos de entrada ni se guarda automáticamente la salida.\n\nCONSIDERACIÓN DE COLOR\nLa composición recibe la solución disponible del RGB o Dual Band y se calibra con SPCC. La respuesta espectral de esta\ncomposición no es la de un RGB convencional. Una configuración RGB habitual\nno garantiza colores fotométricos rigurosos para la mezcla. Para un flujo\nfotométrico conviene estudiar calibrar el RGB antes de incorporar banda estrecha.\n\nINSTALAR EN EL MENÚ SCRIPT\n1. Guarda RGB_DualBand_Solver_SPCC.js en una carpeta permanente.\n2. Abre Script → Feature Scripts… → Add… y selecciona esa carpeta.\n3. Pulsa Done.\nLo encontrarás en Script → Utilities → RGB DualBand Solver SPCC.\nSi ya estaba registrado, sustituye el archivo anterior en su misma carpeta.\n\nPRUEBAS Y LÍMITES\nSe han comprobado en PixInsight 1.9.5 la fórmula, la interfaz, los controles\nSPCC y las preferencias. Para la nueva comparación se prueban la transferencia\nreal de una solución WCS sintética, la reutilización de astrometría, las mezclas\nindependientes, la conservación del intento anterior si falla otro, el bloqueo\nde una aceptación desactualizada y la aceptación sin repetir cálculos.\n\nLas pruebas automáticas del ciclo de comparación usan imágenes sintéticas y\nuna transformación de prueba en lugar de una calibración SPCC real. La ejecución\ncon un campo real de estrellas y tus catálogos sigue pendiente. Es una primera\nversión experimental; sus tiempos de respuesta se deben evaluar con tus imágenes.\n\nCopyright © Carlos Rincón 2026\n\nCORRECCIÓN 0.11\nLas copias de previsualización incluyen todos los canales y el campo completo,\naunque haya un canal o un rectángulo seleccionado. Se conserva la selección\nde la imagen de origen. Corregido el aviso de processEvents obsoleto.\n\nVOLVER A LA PRIMERA PANTALLA (0.12)\nEn la previsualización, pulsa Volver para cambiar las imágenes o los ajustes\nSPCC. Se conservan las selecciones, los ajustes SPCC, el nombre y la última\nintensidad válida. Se cierran las imágenes temporales de esa previsualización.\nAl entrar de nuevo, pulsa Actualizar para calcular el nuevo resultado.\nCancelar termina el script; Volver permite seguir configurándolo.\n\nHEREDAR ASTROMETRÍA (0.13)\nSi el RGB tiene solución astrométrica, se utiliza esa solución. Si no la tiene,\nse utiliza la de Dual Band, tanto si esta es monocroma como RGB. Si ambas tienen\nsolución, tiene prioridad el RGB. Image Solver solo se abre cuando ninguna\ntiene solución. Las actualizaciones de intensidad reutilizan la solución.\nLa solución se copia a las imágenes temporales y al resultado, sin modificar\nlas entradas. Ambas deben estar alineadas y tener las mismas dimensiones:\nuna solución de un encuadre diferente no es válida aunque el tamaño coincida.\nSPCC sigue ejecutándose en cada actualización.\n";
class RD_HelpDialog extends Dialog
{
constructor()
{
   super();var self=this;this.windowTitle="Ayuda e instrucciones · RGB + Dual Band · v0.13";
   this.manual=new TextBox(this);this.manual.readOnly=true;this.manual.text=RD_HELP_TEXT;
   this.manual.setScaledMinSize(700,460);
   this.exportButton=new PushButton(this);this.exportButton.text="Guardar manual .txt...";
   this.exportButton.onClick=function()
   {
      var picker=new SaveFileDialog;picker.caption="Guardar las instrucciones";
      picker.filters=[["Archivo de texto",".txt"]];picker.initialPath="Guia_RGB_DualBand_Solver_SPCC.txt";
      if(picker.execute())try{File.writeTextFile(picker.fileName,RD_HELP_TEXT);}
      catch(e){new MessageBox(String(e),"No se pudo guardar el manual",StdIcon_Error,StdButton_Ok).execute();}
   };
   var close=new PushButton(this);close.text="Cerrar";close.onClick=function(){self.ok();};
   var buttons=new HorizontalSizer;buttons.spacing=8;buttons.add(this.exportButton);buttons.addStretch();buttons.add(close);
   this.sizer=new VerticalSizer;this.sizer.margin=10;this.sizer.spacing=8;this.sizer.add(this.manual,100);this.sizer.add(buttons);
   this.adjustToContents();
}
}
function RD_showHelp(){(new RD_HelpDialog).execute();}
function RD_validate(rgb,dual,id)
{
   if(!rgb || rgb.isNull || !dual || dual.isNull)throw new Error("Selecciona las dos imágenes.");
   if(rgb.isPreview || dual.isPreview)throw new Error("Selecciona imágenes principales, no previews.");
   if(!rgb.image.isColor || rgb.image.numberOfNominalChannels!=3)throw new Error("La primera imagen debe ser RGB.");
   if(dual.image.numberOfNominalChannels!=1 && dual.image.numberOfNominalChannels!=3)throw new Error("Dual Band debe ser monocroma o RGB.");
   if(rgb.image.width!=dual.image.width || rgb.image.height!=dual.image.height)throw new Error("Las dos imágenes deben tener las mismas dimensiones y estar registradas entre sí.");
   if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id))throw new Error("Nombre: usa letras sin acentos, números y guion bajo; no empieces con un número.");
   if(!ImageWindow.windowById(id).isNull)throw new Error("Ya existe una imagen llamada "+id);
}
function RD_intensity(value)
{
   if(value===undefined)return 3;
   var text=String(value).trim().replace(",",".");
   if(!text)throw new Error("Escribe una intensidad entre 1 y 5.");
   var factor=Number(text);
   if(!isFinite(factor) || factor<1 || factor>5)throw new Error("La intensidad debe estar entre 1 y 5.");
   return factor;
}
function RD_create(rgb,dual,id,intensity,visible)
{
   RD_validate(rgb,dual,id);
   var factor=RD_intensity(intensity);
   var p=new PixelMath;
   p.useSingleExpression=false;
   p.expression=rgb.id+"[0] + "+String(factor)+"*"+dual.id+"[0]";
   p.expression1=rgb.id+"[1]";p.expression2=rgb.id+"[2]";
   p.generateOutput=true;p.singleThreaded=false;p.use64BitWorkingImage=true;
   p.rescale=false;p.truncate=false;
   p.createNewImage=true;p.showNewImage=visible!==false;p.newImageId=id;
   p.newImageWidth=rgb.image.width;p.newImageHeight=rgb.image.height;
   p.newImageAlpha=false;p.newImageColorSpace=PixelMath.RGB;
   p.newImageSampleFormat=PixelMath.f32;
   console.writeln("R = "+p.expression+"\nG = "+p.expression1+"\nB = "+p.expression2);
   if(!p.executeOn(rgb))throw new Error("PixelMath no ha terminado correctamente.");
   var out=ImageWindow.windowById(id);
   if(out.isNull)throw new Error("PixelMath no ha creado la imagen esperada.");
   out.keywords=rgb.window.keywords;
   if(visible!==false)out.show();return out;
}
function RD_solve(window,seedWindow)
{
   var engine=new ImageSolver;
   engine.initialize(seedWindow || window,false);
   engine.solverCfg.useActive=true;
   var dialog=new ImageSolverDialog(engine.solverCfg,engine.metadata,true);
   if(!dialog.execute())return false;
   engine.solverCfg=dialog.solverCfg;engine.solverCfg.useActive=true;
   engine.metadata=dialog.metadata;
   engine.solveImage(window);
   if(!window.hasAstrometricSolution)throw new Error("Image Solver no ha generado una solución astrométrica. Se conserva la composición; SPCC no se ejecuta.");
   return true;
}
function RD_getSPCC(icon)
{
   if(icon && typeof icon.processId=="function" && icon.processId()=="SpectrophotometricColorCalibration")return icon;
   if(!icon)throw new Error("Selecciona un icono de SPCC configurado en el escritorio de PixInsight.");
   var p=ProcessInstance.fromIcon(icon);
   if(!p || p.processId()!="SpectrophotometricColorCalibration")throw new Error("El icono elegido no es de SPCC.");
   return p;
}
function RD_run(config,solver)
{
   RD_validate(config.rgb,config.dual,config.id);
   config.intensity=RD_intensity(config.intensity);
   var spcc=RD_getSPCC(config.spcc || config.spccIcon); // Check configuration before creating the result.
   var out=RD_create(config.rgb,config.dual,config.id,config.intensity);
   console.writeln("Composición creada: "+out.mainView.id);
   if(!(solver ? solver(out) : RD_solve(out,config.rgb.window)))return {window:out,canceled:true};
   if(!out.hasAstrometricSolution)throw new Error("No hay solución astrométrica: SPCC no se ejecuta.");
   console.writeln("Ejecutando SPCC con la configuración integrada. Blanco: "+spcc.whiteReferenceName);
   if(!spcc.executeOn(out.mainView))throw new Error("SPCC no ha terminado correctamente. La composición permanece abierta.");
   out.show();return {window:out,canceled:false};
}
function RD_uniqueId(base)
{
   var id=base,n=2;while(!ImageWindow.windowById(id).isNull)id=base+"_"+n++;return id;
}
// Image copies honor the source selection, including its channel range and ROI.
function RD_fullImageCopy(image)
{
   image.pushSelections();
   try{image.resetSelections();return new Image(image);}
   finally{image.popSelections();}
}
function RD_cloneReference(view)
{
   var out=new ImageWindow(view.image.width,view.image.height,3,32,true,true,RD_uniqueId("RD_Referencia"));
   try
   {
      var full=RD_fullImageCopy(view.image);
      try{out.mainView.beginProcess();try{out.mainView.image.assign(full);}finally{out.mainView.endProcess();}}finally{full.free();}
      out.keywords=view.window.keywords;
      if(view.window.hasAstrometricSolution)out.copyAstrometricSolution(view.window);
      return out;
   }
   catch(e){out.forceClose();throw e;}
}
function RD_closeOwned(window){if(window && !window.isNull)window.forceClose();}
function RD_previewDispose(state)
{
   RD_closeOwned(state.reference);state.reference=null;
   if(!state.accepted){RD_closeOwned(state.result);state.result=null;}
}
function RD_previewUpdate(config,state,value,services)
{
   services=services || {};var factor=RD_intensity(value);
   RD_getSPCC(config.spcc || config.spccIcon);
   if(!state.reference || state.reference.isNull)
   {
      state.reference=RD_cloneReference(config.rgb);
      state.referenceSTF=RD_linkedSTF(state.reference.mainView.image);
   }
   if(!state.reference.hasAstrometricSolution && config.dual.window.hasAstrometricSolution)
   {
      state.reference.copyAstrometricSolution(config.dual.window);
      if(!state.reference.hasAstrometricSolution)throw new Error("No se pudo heredar la solución astrométrica de Dual Band.");
      console.writeln("Solución astrométrica heredada de Dual Band: "+config.dual.id);
   }
   if(!state.reference.hasAstrometricSolution)
   {
      var solved=services.solve?services.solve(state.reference,config.rgb.window):RD_solve(state.reference,config.rgb.window);
      if(!solved)return false;
      if(!state.reference.hasAstrometricSolution)throw new Error("No se ha obtenido solución astrométrica para la referencia RGB.");
   }
   var candidate=null;
   try
   {
      candidate=RD_create(state.reference.mainView,config.dual,RD_uniqueId("RD_Calibrada"),factor,false);
      candidate.copyAstrometricSolution(state.reference);
      if(!candidate.hasAstrometricSolution)throw new Error("No se pudo trasladar la solución a la composición.");
      if(services.calibrate)services.calibrate(candidate,config.spcc);
      else
      {
         var spcc=RD_getSPCC(config.spcc || config.spccIcon);
         var graphs=spcc.generateGraphs,maps=spcc.generateStarMaps,text=spcc.generateTextFiles;
         try
         {
            spcc.generateGraphs=false;spcc.generateStarMaps=false;spcc.generateTextFiles=false;
            if(!spcc.executeOn(candidate.mainView))throw new Error("SPCC no ha completado la calibración.");
         }
         finally{spcc.generateGraphs=graphs;spcc.generateStarMaps=maps;spcc.generateTextFiles=text;}
      }
      // Keep the last successful preview until its replacement is calibrated.
      var previous=state.result;state.result=candidate;candidate=null;state.factor=factor;
      RD_closeOwned(previous);return true;
   }
   finally{RD_closeOwned(candidate);}
}
function RD_linkedSTF(image)
{
   var sample=RD_fullImageCopy(image),median=0,mad=0;
   try
   {
      var scale=Math.min(1,700/Math.max(sample.width,sample.height));if(scale<1)sample.resample(scale);
      for(var c=0;c<3;++c){sample.selectedChannel=c;median+=sample.median()/3;mad+=sample.MAD()/3;}
   }
   finally{sample.free();}
   var shadows=Math.max(0,Math.min(0.99,median-2.8*1.4826*mad));
   var x=Math.max(1e-6,Math.min(0.999999,(median-shadows)/(1-shadows))),target=0.25;
   var m=(target-1)*x/((2*target-1)*x-target);m=Math.max(1e-6,Math.min(0.999999,m));
   return {shadows:shadows,midtones:m};
}
function RD_displayBitmap(view,stretch)
{
   var image=RD_fullImageCopy(view.image),display=null;
   try
   {
      var scale=Math.min(1,900/Math.max(image.width,image.height));if(scale<1)image.resample(scale);
      display=new ImageWindow(image.width,image.height,3,32,true,true,RD_uniqueId("RD_Pantalla"));
      display.mainView.beginProcess();try{display.mainView.image.assign(image);}finally{display.mainView.endProcess();}
      var h=new HistogramTransformation;
      h.H=[[0,0.5,1,0,1],[0,0.5,1,0,1],[0,0.5,1,0,1],[stretch.shadows,stretch.midtones,1,0,1],[0,0.5,1,0,1]];
      if(!h.executeOn(display.mainView))throw new Error("No se pudo preparar la visualización.");
      return display.mainView.image.render();
   }
   finally{image.free();RD_closeOwned(display);}
}
function RD_acceptPreview(config,state,name,value)
{
   var factor=RD_intensity(value);
   if(!state.result || state.result.isNull || factor!==state.factor)throw new Error("Actualiza la previsualización con la intensidad elegida antes de aceptar.");
   if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw new Error("Nombre de imagen no válido.");
   var existing=ImageWindow.windowById(name);
   if(!existing.isNull && existing.mainView.id!=state.result.mainView.id)throw new Error("Ya existe una imagen llamada "+name);
   state.result.mainView.id=name;state.accepted=true;state.result.show();return state.result;
}
class RD_PreviewDialog extends Dialog
{
constructor(config,services)
{
   super();var self=this;this.config=config;this.services=services;this.state={reference:null,result:null,accepted:false};
   this.windowTitle="Previsualización calibrada con SPCC · v0.13";
   function label(text){var l=new Label(self);l.text=text;l.wordWrapping=true;return l;}
   function pane()
   {
      var c=new Control(self);c.bitmap=null;c.setScaledMinSize(380,300);
      c.onPaint=function()
      {
         var g=new Graphics(this);try
         {
            g.fillRect(0,0,this.width,this.height,new Brush(0xff202020));
            if(this.bitmap)
            {
               var ratio=Math.min(this.width/this.bitmap.width,this.height/this.bitmap.height),w=Math.round(this.bitmap.width*ratio),h=Math.round(this.bitmap.height*ratio);
               var x=Math.floor((this.width-w)/2),y=Math.floor((this.height-h)/2);g.drawScaledBitmap(x,y,x+w,y+h,this.bitmap);
            }
         }finally{g.end();}
      };return c;
   }
   this.originalPane=pane();this.resultPane=pane();
   var columns=new HorizontalSizer;columns.spacing=8;
   var left=new VerticalSizer;left.add(label("10. Comparar · RGB original"));left.add(this.originalPane,100);
   var right=new VerticalSizer;right.add(label("Resultado calibrado con SPCC"));right.add(this.resultPane,100);columns.add(left,100);columns.add(right,100);
   this.slider=new Slider(this);this.slider.setRange(100,500);this.slider.value=Math.round(config.intensity*100);
   this.factorEdit=new Edit(this);this.factorEdit.text=String(config.intensity);this.factorEdit.setScaledFixedWidth(75);
   this.slider.onValueUpdated=function(value){self.factorEdit.text=(value/100).toFixed(2);self.updateFreshness();};
   this.factorEdit.onEditCompleted=function(){try{var v=RD_intensity(self.factorEdit.text);self.slider.value=Math.round(v*100);self.updateFreshness();}catch(e){self.status.text=String(e);self.acceptButton.enabled=false;}};
   var factorRow=new HorizontalSizer;factorRow.spacing=8;factorRow.add(label("8. Ajustar intensidad Dual Band (1–5):"));factorRow.add(this.slider,100);factorRow.add(this.factorEdit);
   this.sharedSTF=new CheckBox(this);this.sharedSTF.text="Mismo STF para comparar el color";this.sharedSTF.checked=false;
   this.sharedSTF.onCheck=function(){try{self.refreshBitmaps();}catch(e){self.status.text=String(e);}};
   this.status=label("Pulsa Actualizar previsualización. Se hereda la solución del RGB o Dual Band; solo se resuelve si ninguna tiene solución.");
   this.outputName=new Edit(this);this.outputName.text=config.id;
   var nameRow=new HorizontalSizer;nameRow.spacing=8;nameRow.add(label("11. Revisar nombre del resultado:"));nameRow.add(this.outputName,100);
   this.updateButton=new PushButton(this);this.updateButton.text="9. Actualizar previsualización";
   this.updateButton.onClick=function()
   {
      self.updateButton.enabled=false;self.acceptButton.enabled=false;self.cancelButton.enabled=false;self.backButton.enabled=false;self.slider.enabled=false;self.factorEdit.enabled=false;self.sharedSTF.enabled=false;
      try
      {
         self.status.text="Calculando mezcla y calibrando con SPCC…";CoreApplication.processEvents();
         if(RD_previewUpdate(config,self.state,self.factorEdit.text,self.services))
         {self.refreshBitmaps();self.status.text="Previsualización calibrada · intensidad "+self.state.factor+". Puedes aceptarla o probar otra.";}
         else self.status.text="Image Solver cancelado. Puedes actualizar otra vez o cancelar.";
      }
      catch(e){self.status.text="Error: "+String(e);console.warningln(String(e));}
      finally
      {
         self.updateButton.enabled=true;self.cancelButton.enabled=true;self.backButton.enabled=true;self.slider.enabled=true;self.factorEdit.enabled=true;self.sharedSTF.enabled=true;self.updateFreshness();
      }
   };
   this.acceptButton=new PushButton(this);this.acceptButton.text="12. Aceptar resultado";this.acceptButton.enabled=false;
   this.acceptButton.onClick=function()
   {
      try
      {
         var stf=self.sharedSTF.checked?self.state.referenceSTF:RD_linkedSTF(self.state.result.mainView.image);
         var result=RD_acceptPreview(config,self.state,self.outputName.text.trim(),self.factorEdit.text);
         result.mainView.stf=[[stf.midtones,stf.shadows,1,0,1],[stf.midtones,stf.shadows,1,0,1],[stf.midtones,stf.shadows,1,0,1],[0.5,0,1,0,1]];
         self.ok();
      }catch(e){new MessageBox(String(e),"Revisar resultado",StdIcon_Warning,StdButton_Ok).execute();}
   };
   this.returnToSetup=false;
   this.backButton=new PushButton(this);this.backButton.text="Volver";
   this.backButton.toolTip="Regresa a la primera pantalla conservando los ajustes. Se descarta la previsualización temporal.";
   this.backButton.onClick=function(){self.returnToSetup=true;self.cancel();};
   this.cancelButton=new PushButton(this);this.cancelButton.text="Cancelar";this.cancelButton.onClick=function(){self.returnToSetup=false;self.cancel();};
   var buttons=new HorizontalSizer;buttons.spacing=8;buttons.add(this.backButton);buttons.addStretch();buttons.add(this.acceptButton);buttons.add(this.cancelButton);
   this.sizer=new VerticalSizer;this.sizer.margin=10;this.sizer.spacing=8;this.sizer.add(factorRow);this.sizer.add(this.updateButton);this.sizer.add(columns,100);this.sizer.add(this.sharedSTF);this.sizer.add(this.status);this.sizer.add(nameRow);this.sizer.add(buttons);this.sizer.add(label("STF solo para visualización. SPCC se ejecuta a resolución completa. Copyright © Carlos Rincón 2026"));
   this.adjustToContents();
}
updateFreshness()
{
   var fresh=false;try{fresh=!!this.state.result && !this.state.result.isNull && RD_intensity(this.factorEdit.text)===this.state.factor;}catch(e){}
   this.acceptButton.enabled=fresh;
   if(this.state.result && !fresh)this.status.text="Intensidad modificada: pulsa Actualizar previsualización para recalibrar.";
}
refreshBitmaps()
{
   if(!this.state.reference || !this.state.result)return;
   var shared=this.state.referenceSTF,stretch=this.sharedSTF.checked?shared:RD_linkedSTF(this.state.result.mainView.image);
   this.originalPane.bitmap=RD_displayBitmap(this.state.reference.mainView,shared);
   this.resultPane.bitmap=RD_displayBitmap(this.state.result.mainView,stretch);
   this.originalPane.update();this.resultPane.update();
}
}

var RD_DEFAULTS_KEY="CarlosRincon/RGBDualBandSPCC/v1/defaults";
var RD_DEFAULT_FIELDS=["redFilterName","redFilterTrCurve","greenFilterName","greenFilterTrCurve",
   "blueFilterName","blueFilterTrCurve","deviceQECurveName","deviceQECurve","whiteReferenceName",
   "whiteReferenceSpectrum","autoLimitMagnitude","limitMagnitude","neutralizeBackground","generateGraphs"];
function RD_saveDefaults(process,key)
{
   var record={schema:1,parameters:{}};
   RD_DEFAULT_FIELDS.forEach(function(name){record.parameters[name]=process[name];});
   Settings.write(key || RD_DEFAULTS_KEY,DataType.String,JSON.stringify(record));
}
function RD_loadDefaults(key)
{
   var process=new SpectrophotometricColorCalibration;
   try
   {
      var text=Settings.read(key || RD_DEFAULTS_KEY,DataType.String);
      if(!Settings.lastReadOK || !text)return process;
      var record=JSON.parse(text);
      if(record.schema!=1 || !record.parameters)throw new Error("Formato de preferencias no reconocido");
      // Validate the complete record before assigning any parameter.
      RD_DEFAULT_FIELDS.forEach(function(name)
      {
         var value=record.parameters[name];
         if(typeof value!=typeof process[name] || (typeof value=="number" && !isFinite(value)))throw new Error("Preferencia no válida: "+name);
      });
      RD_DEFAULT_FIELDS.forEach(function(name){process[name]=record.parameters[name];});
   }
   catch(e){console.warningln("No se pudieron cargar los ajustes guardados de SPCC; se usan los iniciales. "+String(e));return new SpectrophotometricColorCalibration;}
   return process;
}
function RD_spectralLibrary()
{
   function read(file,tag)
   {
      var doc=new XMLDocument;doc.parseFromFile(CoreApplication.libraryDirPath+"/"+file);
      return doc.rootElement.childElementsByName(tag).map(function(e){return {name:e.attributeValue("name"),data:e.attributeValue("data"),channel:e.attributeValue("channel")};});
   }
   return {filters:read("filters.xspd","Filter"),whites:read("white-references.xspd","WhiteRef")};
}
class RD_SPCCDialog extends Dialog
{
constructor(process)
{
   super();var self=this;this.windowTitle="Configurar SPCC";this.options={};
   var library=RD_spectralLibrary();
   function label(text){var l=new Label(self);l.text=text;l.wordWrapping=true;return l;}
   function selector(title,entries,current,key)
   {
      entries=entries.slice().sort(function(a,b){return a.name.localeCompare(b.name);});
      // Retain a configured curve even if it is absent from the bundled library.
      if(!entries.some(function(e){return e.name==current.name;}))entries.unshift(current);
      var combo=new ComboBox(self);
      for(var i=0;i<entries.length;++i){combo.addItem(entries[i].name);if(entries[i].name==current.name)combo.currentItem=i;}
      self.options[key]={combo:combo,entries:entries};
      var row=new HorizontalSizer;row.spacing=8;row.add(label(title));row.add(combo,100);return row;
   }
   this.rows=[];
   for(var channel of ["red","green","blue"])
   {
      var code=channel[0].toUpperCase(),title=channel=="red"?"Filtro rojo:":channel=="green"?"Filtro verde:":"Filtro azul:";
      this.rows.push(selector(title,library.filters.filter(function(e){return e.channel==code || e.channel=="PAN" || e.channel=="L";}),
         {name:process[channel+"FilterName"],data:process[channel+"FilterTrCurve"]},channel));
   }
   this.rows.push(selector("Curva QE:",library.filters.filter(function(e){return e.channel=="Q";}),{name:process.deviceQECurveName,data:process.deviceQECurve},"qe"));
   this.rows.push(selector("Referencia de blanco:",library.whites,{name:process.whiteReferenceName,data:process.whiteReferenceSpectrum},"white"));
   this.autoMagnitude=new CheckBox(this);this.autoMagnitude.text="Magnitud límite automática";this.autoMagnitude.checked=process.autoLimitMagnitude;
   this.magnitude=new Edit(this);this.magnitude.text=String(process.limitMagnitude);this.magnitude.enabled=!this.autoMagnitude.checked;
   this.autoMagnitude.onCheck=function(checked){self.magnitude.enabled=!checked;};
   var magrow=new HorizontalSizer;magrow.spacing=8;magrow.add(this.autoMagnitude);magrow.add(label("Magnitud manual:"));magrow.add(this.magnitude,100);
   this.neutralize=new CheckBox(this);this.neutralize.text="Neutralizar el fondo";this.neutralize.checked=process.neutralizeBackground;
   this.background=new ViewList(this);this.background.getMainViews();
   if(process.backgroundReferenceViewId){var view=View.viewById(process.backgroundReferenceViewId);if(view && !view.isNull)this.background.currentView=view;}
   var bgrow=new HorizontalSizer;bgrow.spacing=8;bgrow.add(label("Referencia de fondo (vacío = propia imagen):"));bgrow.add(this.background,100);
   this.graphs=new CheckBox(this);this.graphs.text="Generar gráficas";this.graphs.checked=process.generateGraphs;
   this.okButton=new PushButton(this);this.okButton.text="Aceptar";
   this.okButton.onClick=function()
   {
      try{self.validate();self.ok();}catch(e){new MessageBox(String(e),"Revisar SPCC",StdIcon_Warning,StdButton_Ok).execute();}
   };
   var cancel=new PushButton(this);cancel.text="Cancelar";cancel.onClick=function(){self.cancel();};
   this.saveDefaults=new PushButton(this);this.saveDefaults.text="Guardar como predeterminados";
   this.saveDefaults.onClick=function()
   {
      try
      {
         var candidate=new SpectrophotometricColorCalibration;self.applyTo(candidate);RD_saveDefaults(candidate);
         new MessageBox("Ajustes guardados. Se cargarán al volver a abrir este script.\nLa vista de referencia del fondo se elige en cada sesión.","Predeterminados de SPCC",StdIcon_Information,StdButton_Ok).execute();
      }
      catch(e){new MessageBox(String(e),"No se pudieron guardar los ajustes",StdIcon_Error,StdButton_Ok).execute();}
   };
   var help=new PushButton(this);help.text="Ayuda";help.onClick=RD_showHelp;
   var buttons=new HorizontalSizer;buttons.spacing=8;buttons.add(help);buttons.add(this.saveDefaults);buttons.addStretch();buttons.add(this.okButton);buttons.add(cancel);
   this.sizer=new VerticalSizer;this.sizer.margin=12;this.sizer.spacing=8;
   this.sizer.add(label("Ajustes de SPCC. Puedes usarlos ahora o guardarlos como predeterminados para las próximas ejecuciones."));
   this.rows.forEach(function(row){self.sizer.add(row);});
   this.sizer.add(label("Para filtros de un sensor de color que ya incluyen su sensibilidad, utiliza Ideal QE curve."));
   this.sizer.add(magrow);this.sizer.add(this.neutralize);this.sizer.add(bgrow);this.sizer.add(this.graphs);
   this.sizer.add(label("Catálogo: "+process.catalogId+". Se utiliza la instalación de catálogos de PixInsight; este diálogo no descarga ni instala Gaia."));
   this.sizer.add(buttons);this.sizer.add(label("Copyright © Carlos Rincón 2026"));this.setScaledMinWidth(650);this.adjustToContents();
}
validate()
{
   var m=Number(this.magnitude.text.trim());
   if(!this.autoMagnitude.checked && (!isFinite(m) || m<0 || m>30))throw new Error("Escribe una magnitud manual entre 0 y 30.");
}
applyTo(process)
{
   this.validate();
   function selected(option){return option.entries[option.combo.currentItem];}
   for(var channel of ["red","green","blue"])
   {
      var entry=selected(this.options[channel]);process[channel+"FilterName"]=entry.name;process[channel+"FilterTrCurve"]=entry.data;
   }
   var qe=selected(this.options.qe),white=selected(this.options.white);
   process.deviceQECurveName=qe.name;process.deviceQECurve=qe.data;
   process.whiteReferenceName=white.name;process.whiteReferenceSpectrum=white.data;
   process.autoLimitMagnitude=this.autoMagnitude.checked;
   if(!process.autoLimitMagnitude)process.limitMagnitude=Number(this.magnitude.text.trim());
   process.neutralizeBackground=this.neutralize.checked;
   var bg=this.background.currentView;process.backgroundReferenceViewId=bg && !bg.isNull?bg.id:"";
   process.generateGraphs=this.graphs.checked;process.applyCalibration=true;
   // This is the requested broadband/hybrid RGB workflow, not an SHO/HOO calibration.
   process.narrowbandMode=false;
}
}
class RD_Dialog extends Dialog
{
constructor()
{
   super();var self=this;
   this.windowTitle="RGB + Dual Band → Image Solver → SPCC · v0.13";
   function label(text){var l=new Label(self);l.text=text;l.wordWrapping=true;return l;}
   function choose(list)
   {
      var f=new OpenFileDialog;f.multipleSelections=false;f.loadImageFilters();
      if(f.execute())
      {
         var windows=ImageWindow.open(f.fileName,"","",true);
         if(windows.length!=1){for(var i=0;i<windows.length;++i)windows[i].forceClose();throw new Error("Elige un archivo con una sola imagen.");}
         var previousRGB=self.rgb.currentView,previousDual=self.dual.currentView;
         windows[0].show();self.rgb.getMainViews();self.dual.getMainViews();
         if(previousRGB && !previousRGB.isNull)self.rgb.currentView=previousRGB;
         if(previousDual && !previousDual.isNull)self.dual.currentView=previousDual;
         list.currentView=windows[0].mainView;
      }
   }
   function imageRow(title,list)
   {
      var b=new PushButton(self);b.text="Abrir archivo...";b.onClick=function(){try{choose(list);}catch(e){new MessageBox(String(e),"Error",StdIcon_Error,StdButton_Ok).execute();}};
      var row=new HorizontalSizer;row.spacing=6;row.add(label(title));row.add(list,100);row.add(b);return row;
   }
   this.rgb=new ViewList(this);this.rgb.getMainViews();this.dual=new ViewList(this);this.dual.getMainViews();
   this.rgbRow=imageRow("2. Imagen RGB:",this.rgb);this.dualRow=imageRow("3. Imagen Dual Band:",this.dual);
   this.idEdit=new Edit(this);this.idEdit.text="RGB_DualBand";
   this.spccProcess=RD_loadDefaults();
   this.spccSummary=label("");
   this.updateSPCCSummary=function(){self.spccSummary.text="SPCC · R: "+self.spccProcess.redFilterName+" · G: "+self.spccProcess.greenFilterName+" · B: "+self.spccProcess.blueFilterName+" · Blanco: "+self.spccProcess.whiteReferenceName;};
   this.updateSPCCSummary();
   this.configureSPCC=new PushButton(this);this.configureSPCC.text="5. Configurar SPCC...";
   this.configureSPCC.onClick=function()
   {
      try{var dialog=new RD_SPCCDialog(self.spccProcess);if(dialog.execute()){dialog.applyTo(self.spccProcess);self.updateSPCCSummary();}}
      catch(e){new MessageBox(String(e),"Configuración SPCC",StdIcon_Error,StdButton_Ok).execute();}
   };
   this.preparation=label("1. Preparación previa: imágenes lineales y alineadas, con gradientes eliminados y calibración de color realizada en ambas, RGB y Dual Band. Reducción de ruido con ML Denoise: opcional.");
   this.linear=new CheckBox(this);this.linear.text="6. Confirmo que las imágenes de partida están preparadas";
   this.linear.toolTip="Esta casilla no verifica el procesado previo. STF de visualización sí se permite.";
   this.okButton=new PushButton(this);this.okButton.text="7. Abrir previsualización";
   this.okButton.onClick=function()
   {
      try
      {
         if(!self.linear.checked)throw new Error("Prepara las imágenes: lineales, alineadas, sin gradientes y con calibración de color previa en ambas, RGB y Dual Band. ML Denoise es opcional. STF de visualización sí se permite.");
         var config={rgb:self.rgb.currentView,dual:self.dual.currentView,id:self.idEdit.text.trim(),spcc:self.spccProcess,intensity:self.previewIntensity===undefined?3:self.previewIntensity};
         RD_validate(config.rgb,config.dual,config.id);RD_getSPCC(config.spcc);self.config=config;self.ok();
      }catch(e){new MessageBox(String(e),"Revisar datos",StdIcon_Warning,StdButton_Ok).execute();}
   };
   this.cancelButton=new PushButton(this);this.cancelButton.text="Cancelar";this.cancelButton.onClick=function(){self.cancel();};
   this.helpButton=new PushButton(this);this.helpButton.text="Ayuda e instrucciones";this.helpButton.onClick=RD_showHelp;
   var buttons=new HorizontalSizer;buttons.spacing=8;buttons.add(this.helpButton);buttons.addStretch();buttons.add(this.okButton);buttons.add(this.cancelButton);
   this.sizer=new VerticalSizer;this.sizer.margin=12;this.sizer.spacing=8;
   var items=[this.preparation,this.rgbRow,this.dualRow,
      label("4. Nombre de la nueva imagen:"),this.idEdit,this.spccSummary,this.configureSPCC,
      label("La previsualización hereda la solución del RGB o Dual Band. Solo abre Image Solver si ninguna tiene solución. Cada actualización calibra con SPCC."),
      this.linear,buttons,label("Copyright © Carlos Rincón 2026")];
   for(var i=0;i<items.length;++i)this.sizer.add(items[i]);
   this.setScaledMinWidth(650);this.adjustToContents();
}
}
// Reuse the initial dialog so selections and SPCC settings survive Back.
function RD_workflow(dialog,makePreview)
{
   makePreview=makePreview || function(config){return new RD_PreviewDialog(config);};
   while(dialog.execute())
   {
      var preview=makePreview(dialog.config);
      try
      {
         if(preview.execute())return preview.state.result;
         if(!preview.returnToSetup)return null;
         dialog.idEdit.text=preview.outputName.text.trim();
         try{dialog.previewIntensity=RD_intensity(preview.factorEdit.text);}catch(e){dialog.previewIntensity=dialog.config.intensity;}
      }
      finally{RD_previewDispose(preview.state);}
   }
   return null;
}
#ifndef RGB_DUAL_LIBRARY
try
{
   console.show();var result=RD_workflow(new RD_Dialog);
   if(result)new MessageBox("Resultado calibrado: "+result.mainView.id+"\nSe conserva la imagen que acabas de revisar, sin repetir SPCC. Guárdala cuando quieras conservarla.","RGB + Dual Band",StdIcon_Information,StdButton_Ok).execute();
}
catch(e){console.criticalln(String(e));new MessageBox(String(e),"RGB + Dual Band: error",StdIcon_Error,StdButton_Ok).execute();}
#endif
