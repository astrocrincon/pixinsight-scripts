// Copyright © Carlos Rincón 2026
#feature-id Utilities > Editor de cabeceras FITS-XISF
#feature-info Editor de keywords FITS y metadatos XISF, con simulacion, seleccion recursiva y opciones de guardado.

/* Editor_Cabeceras_FITS_XISF.js — PixInsight PJSR. Default: simulation, no disk writes.
 * Output: Sesion_1/Lights_Metadata (sibling of Lights_OK).
 * Single-image XISF/FITS. Existing outputs and symbolic links are skipped.
 */
#include <pjsr/PropertyType.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/DataType.jsh>

// Ordinary valued FITS keywords only; structural cards remain visible but read-only.
function protectedKeyword( name )
{
   return /^(SIMPLE|XTENSION|BITPIX|NAXIS\d*|EXTEND|PCOUNT|GCOUNT|BSCALE|BZERO|BLANK|END|CHECKSUM|DATASUM|COMMENT|HISTORY|CONTINUE|LONGSTRN|THEAP|TFIELDS|TBCOL\d*|TFORM\d*|Z[A-Z0-9_]*|ROWORDER)$/.test(name);
}
function validateChange( change, fits )
{
   if (!/^[A-Z][A-Z0-9_-]{0,7}$/.test(change.name) || protectedKeyword(change.name))
      throw new Error("Nombre no válido o keyword de estructura/solo lectura: " + change.name);
   if (/^(FILTER|CREATOR|OBJECT)$/.test(change.name) && change.type != "Texto")
      throw new Error(change.name + " debe ser de tipo Texto.");
   if (/^(EXPTIME|EXPOSURE)$/.test(change.name) && change.type != "Número")
      throw new Error(change.name + " debe ser de tipo Número.");
   if (change.type == "Número")
   {
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[EeDd][+-]?\d+)?$/.test(change.value) ||
          !isFinite(Number(change.value.replace(/[dD]/,"e"))))
         throw new Error("Número no válido: " + change.name + ". Usa punto decimal.");
   }
   else if (change.type == "Lógico")
   {
      if (change.value != "T" && change.value != "F") throw new Error("Valor lógico: escribe T o F.");
   }
   else if (change.type != "Texto") throw new Error("Tipo no admitido");
   if (/[\r\n\x00-\x1f]/.test(change.value + change.comment)) throw new Error("No se admiten saltos de línea ni caracteres de control.");
   if (fits) fitsChangeCard(change);
   return change;
}
function keywordLiteral( change )
{
   return change.type == "Texto" ? "'" + change.value.replace(/'/g,"''") + "'" : change.value;
}
function fitsChangeCard( change )
{
   var line = change.name + new Array(9-change.name.length).join(" ") + "= " + keywordLiteral(change);
   if (change.comment.length) line += " / " + change.comment;
   if (/[^\x20-\x7e]/.test(line) || line.length > 80)
      throw new Error("FITS: valor/comentario demasiado largo o con caracteres no ASCII en " + change.name);
   return line + new Array(81-line.length).join(" ");
}
function metadataKeywords( keywords, changes )
{
   var result = [], changed = {};
   for(var i=0;i<changes.length;++i) changed[changes[i].name]=true;
   for(var k=0;k<keywords.length;++k)
      if(!changed[keywords[k].name.trim().toUpperCase()]) result.push(keywords[k]);
   for(var j=0;j<changes.length;++j)
      result.push(new FITSKeyword(changes[j].name,keywordLiteral(changes[j]),changes[j].comment));
   return result;
}
// A small explicit mapping keeps frequently edited XISF metadata consistent.
function mappedProperty( change )
{
   if (change.name == "FILTER" && change.type == "Texto") return ["Instrument:Filter:Name",change.value,PropertyType_String];
   if (change.name == "CREATOR" && change.type == "Texto") return ["User:Creator",change.value,PropertyType_String];
   if (change.name == "OBJECT" && change.type == "Texto") return ["Observation:Object:Name",change.value,PropertyType_String];
   if ((change.name == "EXPTIME" || change.name == "EXPOSURE") && change.type == "Número")
      return ["Instrument:ExposureTime",Number(change.value.replace(/[dD]/,"e")),PropertyType_Float32];
   return null;
}
function verifyMetadata( reader, config )
{
   var keys = reader.keywords;
   for(var j=0;j<config.changes.length;++j)
   {
      var c=config.changes[j], count=0;
      for(var k=0;k<keys.length;++k)
         if(keys[k].name.trim().toUpperCase()==c.name)
         {
            ++count;
            var equal = c.type=="Número" ? Number(keys[k].strippedValue.replace(/[dD]/,"e"))==Number(c.value.replace(/[dD]/,"e")) : (c.type=="Texto"?keys[k].strippedValue.replace(/''/g,"'"):keys[k].strippedValue)==c.value;
            if(!equal || keys[k].comment.trim()!=c.comment.trim()) throw new Error("No coincide valor/comentario: " + c.name);
         }
      if(count!=1) throw new Error("Keyword ausente o duplicada: " + c.name);
      var m=mappedProperty(c);
      if(reader.format.canStoreImageProperties && m)
      {
         var value=reader.readImageProperty(m[0]);
         var equalProperty = typeof m[1]=="number" ? Math.abs(value-m[1])<=1e-6*Math.max(1,Math.abs(m[1])) : value==m[1];
         if(!equalProperty)throw new Error("Propiedad XISF no coincide: " + m[0]);
      }
   }
}

// FITS: copy primary header cards and all following bytes without pixel re-encoding.
// Remove CHECKSUM because it covers the changed header; DATASUM remains valid.
function writeFitsMetadataCopy( input, output, config )
{
   var changed = {}, newCards = [];
   for(var i=0;i<config.changes.length;++i)
   {
      validateChange(config.changes[i],true);
      changed[config.changes[i].name]=true;
      newCards.push(fitsChangeCard(config.changes[i]));
   }
   var source = new File, target = new File;
   try
   {
      source.openForReading(input);
      var cards = [], ended = false, skipContinuation = false;
      while ( !ended )
      {
         if ( source.size-source.position < 2880 ) throw new Error("Cabecera FITS incompleta");
         var block = source.read(DataType_ByteArray, 2880);
         for ( var offset=0; offset<2880; offset+=80 )
         {
            var line=block.toString(offset,80), name=line.substr(0,8).trim();
            if ( name == "END" ) { ended=true; break; }
            if(name == "CONTINUE" && skipContinuation)continue;
            skipContinuation=!!changed[name];
            if ( !changed[name] && name != "CHECKSUM" ) cards.push(line);
         }
      }
      cards=cards.concat(newCards);
      cards.push("END" + new Array(78).join(" "));
      var header=cards.join("");
      header+=new Array(((2880-header.length%2880)%2880)+1).join(" ");
      target.createForWriting(output);
      target.outText(header);
      while ( source.position < source.size )
      {
         processEvents();
         if ( console.abortRequested ) throw new Error("Aborted by user");
         target.write(source.read(DataType_ByteArray, Math.min(1048576,source.size-source.position)));
      }
   }
   finally { if(source.isOpen)source.close(); if(target.isOpen)target.close(); }
}

function runMetadata( config )
{
   function clean( p ) { return File.fullPath( p ).replace( /\\/g, "/" ).replace( /\/+$/, "" ); }
   function exists( p ) { return File.exists( p ) || File.directoryExists( p ); }
   function noLink( p )
   {
      var f = new FileFind;
      if ( f.begin( p ) )
      {
         var link = f.isSymbolicLink;
         f.end();
         if ( link ) throw new Error( "Symbolic link refused: " + p );
      }
   }
   function closeFile( f )
   {
      if ( f != null && f.isOpen )
         try { f.close(); } catch ( e ) { console.warningln( String( e ) ); }
   }
   function requireOK( result, what )
   {
      if ( !result ) throw new Error( what );
   }
   function copyProperties( reader, writer, imageLevel )
   {
      var list = imageLevel ? reader.imageProperties : reader.properties;
      for ( var n = 0; n < list.length; ++n )
      {
         var id = ("id" in list[n]) ? list[n].id : list[n][0];
         var type = ("type" in list[n]) ? list[n].type : list[n][1];
         var replaced=false;
         if(imageLevel) for(var op=0;op<config.changes.length;++op)
         { var m=mappedProperty(config.changes[op]); if(m && m[0]==id) replaced=true; }
         if(replaced)continue;
         // Format-owned file metadata must describe the new file, not the original encoding.
         if ( !imageLevel && /^XISF:(CreationTime|CreatorApplication|CreatorModule|BlockAlignmentSize|MaxInlineBlockSize|CompressionCodecs|CompressionLevel|ChecksumAlgorithms|OutputHints)$/.test( id ) ) continue;
         var value = imageLevel ? reader.readImageProperty( id ) : reader.readProperty( id );
         requireOK( imageLevel ? writer.writeImageProperty( id, value, type ) :
                                writer.writeProperty( id, value, type ), "Cannot copy property: " + id );
      }
   }
   var overwrite = config.overwrite === true;
   var keepBackup = config.keepBackup !== false;
   var src = clean( config.inputDir ), dst = overwrite ? src : clean( config.outputDir );
   if ( !File.directoryExists( src ) ) throw new Error( "Input directory not found: " + src );
   if ( !overwrite && src.toLowerCase() == dst.toLowerCase() )
      throw new Error( "Para usar la carpeta original, selecciona Sobrescribir originales." );
   var check = dst;
   while ( check.length > 1 ) { noLink( check ); check = File.extractDirectory( check ); }
   check = src;
   while ( check.length > 1 ) { noLink( check ); check = File.extractDirectory( check ); }
   if ( File.exists( dst ) ) throw new Error( "Output path is a file: " + dst );
   var backupRoot = src + "/Metadata_Backups";
   if (overwrite && keepBackup) noLink(backupRoot);
   var backupDir = backupRoot + "/" + new Date().toISOString().replace(/[:.]/g,"-") + "_" + Math.floor(Math.random()*1000000000);
   var files = [], find = new FileFind;
   if ( config.files )
   {
      for ( var n = 0; n < config.files.length; ++n )
      {
         var chosen = clean( config.files[n] );
         if ( File.extractDirectory( chosen ) != src || !/\.(xisf|fits|fit|fts)$/i.test( chosen ) )
            throw new Error( "Select FITS or XISF files from a single folder" );
         noLink( chosen );
         var basename = File.extractNameAndExtension( chosen );
         if ( files.indexOf( basename ) < 0 ) files.push( basename );
      }
   }
   else if ( find.begin( src + "/*" ) )
   {
      do {
         if ( find.isFile && !find.isSymbolicLink && /\.(xisf|fits|fit|fts)$/i.test( find.name ) )
            files.push( find.name );
      } while ( find.next() );
      find.end();
   }
   files.sort();
   var total = files.length;
   if ( config.maxFiles > 0 ) files = files.slice( 0, config.maxFiles );
   var stats = { found: total, selected: files.length, simulated: 0, saved: 0, skipped: 0, overwritten: 0, errors: 0 };
   console.show();
   console.writeln( "Metadata | " + (config.dryRun ? "SIMULATION" : "WRITE") );
   console.writeln( "Mode: " + (overwrite ? (keepBackup ? "OVERWRITE WITH BACKUP" : "OVERWRITE WITHOUT BACKUP") : "COPIES") );
   console.writeln( "Input: " + src + "\nOutput: " + dst + "\nFound: " + total );
   for ( var i = 0; i < files.length; ++i )
   {
      var input = src + "/" + files[i], output = dst + "/" + files[i];
      var reader = null, writer = null, verifier = null, image = null, temp = "", ownTemp = false;
      try
      {
         processEvents();
         if ( console.abortRequested ) throw new Error( "Aborted by user" );
         if ( !overwrite && exists( output ) )
         {
            ++stats.skipped;
            console.writeln( "SKIP existing: " + output );
            continue;
         }
         // Low-level I/O avoids ImageWindow's automatic metadata migration.
         var suffix = File.extractExtension( input ).toLowerCase();
         var isXisf = suffix == ".xisf";
         var format = new FileFormat( suffix, true, true );
         if ( format.isNull || !format.canStoreKeywords || (isXisf && !format.canStoreImageProperties) )
            throw new Error( "XISF format or metadata support unavailable" );
         reader = new FileFormatInstance( format );
         var hints = isXisf ? "properties fits-keywords no-import-fits-keywords no-auto-metadata no-normalize" : "bottom-up";
         var descriptions = reader.open( input, hints );
         if ( !descriptions || descriptions.length != 1 )
            throw new Error( "Expected exactly one image in XISF" );
         var desc = descriptions[0];
         if ( desc.complexSample || (!desc.ieeefpSampleFormat && desc.bitsPerSample > 32) )
            throw new Error( "Unsupported sample format; file skipped without conversion" );
         image = new Image( 1, 1, desc.numberOfChannels, desc.colorSpace, desc.bitsPerSample,
                            desc.ieeefpSampleFormat ? SampleType_Real : SampleType_Integer );
         requireOK( reader.readImage( image ), "Cannot read image" );
         if ( reader.wasInexactRead ) throw new Error( "Inexact pixel read refused" );
         for(var op=0;op<config.changes.length;++op)validateChange(config.changes[op],!isXisf);
         var keywords = metadataKeywords( reader.keywords, config.changes );
         console.writeln( "[" + (i+1) + "/" + files.length + "] " + files[i] );
         var currentKeys=reader.keywords;
         for(var op=0;op<config.changes.length;++op)
         {
            var present=false;
            for(var kk=0;kk<currentKeys.length;++kk)if(currentKeys[kk].name.trim().toUpperCase()==config.changes[op].name)present=true;
            console.writeln((present?"MODIFICAR ":"AÑADIR ")+config.changes[op].name+" => "+config.changes[op].value+" / "+config.changes[op].comment);
         }
         // Simulation reads pixels and properties but creates no directory or file.
         if ( config.dryRun )
         {
            var pp = format.canStoreImageProperties ? reader.imageProperties : [];
            for ( var q = 0; q < pp.length; ++q ) reader.readImageProperty( ("id" in pp[q]) ? pp[q].id : pp[q][0] );
            ++stats.simulated;
            continue;
         }
         if ( !File.directoryExists( dst ) ) File.createDirectory( dst );
         // Save under a unique temporary XISF name, reopen and verify before publishing.
         do { temp = dst + "/.metadata_" + Date.now() + "_" + Math.floor( Math.random()*1000000000 ) + suffix; }
         while ( exists( temp ) );
         ownTemp = true;
         if ( !isXisf ) writeFitsMetadataCopy( input, temp, config );
         else
         {
         writer = new FileFormatInstance( format );
         requireOK( writer.create( temp, hints + (isXisf ? " no-compress-data" : ""), 1 ), "Cannot create temporary XISF" );
         // Preserve resolution, pixel representation, and serialized processing history.
         desc.embedProperties = true;
         desc.embedProcessingHistory = true;
         requireOK( writer.setOptions( desc ), "Cannot set output image options" );
         requireOK( writer.setImageId( desc.id ), "Cannot preserve image identifier" );
         writer.keywords = keywords;
         if ( format.canStoreProperties ) copyProperties( reader, writer, false );
         if ( format.canStoreImageProperties ) copyProperties( reader, writer, true );
         if ( format.canStoreImageProperties )
         {
         for(var op=0;op<config.changes.length;++op)
         {
            var m=mappedProperty(config.changes[op]);
            if(m)requireOK(writer.writeImageProperty(m[0],m[1],m[2]),"Cannot write " + m[0]);
         }
         }
         if ( format.canStoreICCProfiles ) writer.iccProfile = reader.iccProfile;
         if ( format.canStoreRGBWS ) writer.rgbws = reader.rgbws;
         if ( format.canStoreDisplayFunctions ) writer.displayFunction = reader.displayFunction;
         if ( format.canStoreColorFilterArrays )
         {
            var cfa = reader.colorFilterArray;
            if ( cfa.length > 0 && cfa[0].length > 0 ) writer.colorFilterArray = cfa;
         }
         if ( format.canStoreThumbnails )
         {
            var thumb = reader.thumbnail;
            if ( !thumb.isEmpty ) { desc.embedThumbnail = true; requireOK( writer.setOptions( desc ), "Cannot enable thumbnail" ); writer.thumbnail = thumb; }
            thumb.free();
         }
         requireOK( writer.writeImage( image ), "Cannot write pixels" );
         if ( writer.wasLossyWrite ) throw new Error( "Lossy pixel write refused" );
         requireOK( writer.close(), "Cannot finalize XISF" );
         }
         verifier = new FileFormatInstance( format );
         var outputDescriptions = verifier.open( temp, hints );
         if ( !outputDescriptions || outputDescriptions.length != 1 ) throw new Error( "Invalid saved XISF image count" );
         verifyMetadata( verifier, config );
         var outDesc = outputDescriptions[0];
         if ( desc.width != outDesc.width || desc.height != outDesc.height ||
              desc.numberOfChannels != outDesc.numberOfChannels ||
              desc.bitsPerSample != outDesc.bitsPerSample || desc.ieeefpSampleFormat != outDesc.ieeefpSampleFormat )
            throw new Error( "Saved image geometry/sample format changed" );
         closeFile( verifier ); verifier = null;
         closeFile( reader ); reader = null;
         if (overwrite)
         {
            noLink(input);
            var backup;
            if(keepBackup)
            {
               noLink(backupRoot);
               if (!File.directoryExists(backupDir)) File.createDirectory(backupDir,true);
               backup = backupDir + "/" + files[i];
            }
            else
            {
               // Transient recovery file only; removed after verified replacement is installed.
               do { backup=src+"/.metadata_original_"+Date.now()+"_"+Math.floor(Math.random()*1000000000)+suffix; }
               while(exists(backup));
            }
            // Move only after the replacement is complete, closed and verified.
            File.moveFile(backup,input);
            try { File.moveFile(output,temp); }
            catch(publishError)
            {
               try
               {
                  if (!exists(input)) File.moveFile(input,backup);
                  else throw new Error("La ruta original está ocupada");
               }
               catch(restoreError)
               {
                  throw new Error("No se pudo restaurar el original. Está conservado en: " + backup + ". " + String(restoreError));
               }
               throw publishError;
            }
            ++stats.overwritten;
            if(keepBackup)console.writeln("ORIGINAL BACKUP: " + backup);
            else
            {
               try { File.remove(backup); }
               catch(cleanupError) { console.warningln("La sustitución se completó, pero no se pudo eliminar el original temporal: "+backup+". "+String(cleanupError)); }
            }
         }
         else
         {
            if ( exists( output ) ) throw new Error( "Output appeared during processing; refusing overwrite" );
            File.moveFile( output, temp );
         }
         ownTemp = false;
         ++stats.saved;
         console.writeln( "SAVED AND VERIFIED: " + output );
      }
      catch ( e )
      {
         ++stats.errors;
         console.warningln( "ERROR " + input + ": " + String( e ) );
      }
      finally
      {
         closeFile( verifier ); closeFile( writer ); closeFile( reader );
         if ( image != null ) image.free();
         if ( ownTemp && File.exists( temp ) )
            try { File.remove( temp ); }
            catch ( e ) { console.warningln( "Could not remove temporary file: " + temp ); }
      }
      if ( console.abortRequested ) break;
   }
   console.writeln( "SUMMARY " + JSON.stringify( stats ) );
   return stats;
}

#include <pjsr/Sizer.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdButton.jsh>

function readHeaderSnapshot( path )
{
   var f=new FileFormatInstance(new FileFormat(File.extractExtension(path),true,false));
   try
   {
      var d=f.open(path, /\.xisf$/i.test(path) ? "properties fits-keywords no-import-fits-keywords no-auto-metadata" : "bottom-up");
      if(!d || d.length!=1)throw new Error("Se admite una sola imagen por archivo: " + path);
      var rows=[],keys=f.keywords;
      for(var k=0;k<keys.length;++k)
      {
         var kw=keys[k],type=kw.isString?"Texto":kw.isBoolean?"Lógico":kw.isNumeric?"Número":"Solo consulta";
         rows.push({name:kw.name,value:kw.isString?String(kw.strippedValue).replace(/''/g,"'"):String(kw.strippedValue),comment:kw.comment,type:type});
      }
      function appendProperties(imageLevel)
      {
         var list=imageLevel?f.imageProperties:f.properties;
         for(var n=0;n<list.length;++n)
         {
            var id=("id" in list[n])?list[n].id:list[n][0];
            var value=imageLevel?f.readImageProperty(id):f.readProperty(id);
            rows.push({name:id,value:String(value),comment:imageLevel?"Propiedad XISF de imagen; solo consulta":"Propiedad XISF de archivo; solo consulta",type:"Propiedad"});
         }
      }
      if(f.format.canStoreImageProperties)appendProperties(true);
      if(f.format.canStoreProperties)appendProperties(false);
      return rows;
   }
   finally {if(f.isOpen)f.close();}
}

function normalizedHeaderPath(path)
{
   return File.fullPath(path).replace(/\\/g,"/").replace(/\/+$/,"");
}
function scanHeaderDirectory(root, outputDirectory)
{
   root=normalizedHeaderPath(root);
   if(!File.directoryExists(root))throw new Error("Carpeta no encontrada: " + root);
   var output=outputDirectory?normalizedHeaderPath(outputDirectory):"", files=[],errors=[];
   var probe=new FileFind;
   if(probe.begin(root)){var link=probe.isSymbolicLink;probe.end();if(link)throw new Error("Selecciona una carpeta real, no un enlace simbólico.");}
   var stack=[root];console.show();console.writeln("Buscando FITS/XISF en: "+root);
   while(stack.length)
   {
      processEvents();if(console.abortRequested)throw new Error("Búsqueda cancelada");
      var dir=stack.pop(),f=new FileFind;
      try
      {
         if(!f.begin(dir+"/*"))continue;
         do
         {
            if(f.name=="." || f.name==".." || f.isSymbolicLink)continue;
            var path=dir+"/"+f.name;
            if(f.isDirectory)
            {
               if(f.name=="Metadata_Backups" || f.name=="Headers_Metadata" ||
                  (output && path.toLowerCase()==output.toLowerCase()))continue;
               stack.push(path);
            }
            else if(f.isFile && !/^\.metadata_/.test(f.name) && /\.(fit|fits|fts|xisf)$/i.test(f.name))files.push(path);
         }while(f.next());
      }
      catch(e){errors.push(dir+": "+String(e));console.warningln("Carpeta omitida: "+dir+": "+String(e));}
      finally{f.end();}
   }
   files.sort();console.writeln("Encontrados: "+files.length);
   return {files:files,errors:errors};
}
// The low-level writer handles one source folder. Preserve relative paths across groups.
function runHeaderBatch(config)
{
   if(!config.inputRoot)return runMetadata(config);
   var root=normalizedHeaderPath(config.inputRoot),dest=normalizedHeaderPath(config.outputDir);
   if(!config.overwrite && root.toLowerCase()==dest.toLowerCase())throw new Error("El destino de las copias debe ser distinto de la carpeta de origen.");
   var groups=[],byFolder={};
   for(var i=0;i<config.files.length;++i)
   {
      var file=normalizedHeaderPath(config.files[i]);
      if(file.indexOf(root+"/")!=0)throw new Error("Archivo fuera de la carpeta seleccionada: "+file);
      var folder=File.extractDirectory(file),relative=folder==root?"":folder.substring(root.length+1);
      if(!(folder in byFolder))
      {
         byFolder[folder]=groups.length;
         groups.push({inputDir:folder,outputDir:config.overwrite?folder:dest+(relative?"/"+relative:""),files:[],
                      dryRun:config.dryRun,overwrite:config.overwrite,keepBackup:config.keepBackup,maxFiles:0,changes:config.changes});
      }
      groups[byFolder[folder]].files.push(file);
   }
   var total={found:0,selected:0,simulated:0,saved:0,skipped:0,overwritten:0,errors:0};
   for(var g=0;g<groups.length;++g)
   {
      processEvents();if(console.abortRequested)break;
      try
      {
         var result=runMetadata(groups[g]);
         for(var k in total)total[k]+=result[k];
      }
      catch(e){total.found+=groups[g].files.length;total.selected+=groups[g].files.length;total.errors+=groups[g].files.length;console.warningln("Error en carpeta: "+groups[g].inputDir+": "+String(e));}
   }
   console.writeln("TOTAL RECURSIVO "+JSON.stringify(total));return total;
}

function HeaderEditorDialog()
{
   this.__base__=Dialog;this.__base__();
   var self=this;
   this.paths=[];this.inputRoot=null;this.snapshots=[];this.changes=[];this.visibleRows=[];this.config=null;
   this.windowTitle="Editor de cabeceras FITS / XISF";
   function label(text){var l=new Label(self);l.text=text;l.wordWrapping=true;return l;}
   function button(text,callback){var b=new PushButton(self);b.text=text;b.onClick=callback;return b;}
   function row(controls){var r=new HorizontalSizer;r.spacing=6;for(var i=0;i<controls.length;++i)r.add(controls[i],controls[i] instanceof Edit?1:0);return r;}
   function tree(headings,height)
   {
      var t=new TreeBox(self);t.numberOfColumns=headings.length;t.headerVisible=true;t.rootDecoration=false;t.alternateRowColor=true;
      for(var i=0;i<headings.length;++i)t.setHeaderText(i,headings[i]);
      t.setScaledMinWidth(800);t.setScaledFixedHeight(height);return t;
   }
   this.intro=label("1. Selecciona archivos. 2. Elige una cabecera o escribe una nueva. 3. Añade los cambios a la lista y simula o guarda copias.");
   this.select=button("Seleccionar FITS / XISF...",function()
   {
      var p=new OpenFileDialog;p.multipleSelections=true;p.caption="Archivos de una misma carpeta";
      p.filters=[["FITS y XISF",".fit",".fits",".fts",".xisf"]];
      if(p.execute())
      {
         self.select.enabled=false;
         try{self.setFiles(p.fileNames);}
         catch(e){new MessageBox(String(e),"No se pudo leer",StdIcon_Error,StdButton_Ok).execute();}
         finally{self.select.enabled=true;}
      }
   });
   this.selectDirectory=button("Seleccionar carpeta y subcarpetas...",function()
   {
      var picker=new GetDirectoryDialog;picker.caption="Carpeta donde buscar FITS y XISF, incluidas sus subcarpetas";
      if(!picker.execute())return;
      self.select.enabled=false;self.selectDirectory.enabled=false;
      try
      {
         var excluded=/^(\/|[A-Za-z]:[\\/])/.test(self.folderEdit.text.trim())?self.folderEdit.text.trim():"";
         var scan=scanHeaderDirectory(picker.directory,excluded);
         self.setFiles(scan.files,picker.directory,true);
         var skipped=self.readErrors.length+scan.errors.length;
         new MessageBox("Archivos cargados: "+self.paths.length+"\nCarpetas/archivos con error: "+skipped+"\nSe han incluido las subcarpetas. Consulta la consola si hubo errores.","Búsqueda terminada",StdIcon_Information,StdButton_Ok).execute();
      }
      catch(e){new MessageBox(String(e),"No se pudo leer",StdIcon_Error,StdButton_Ok).execute();}
      finally{self.select.enabled=true;self.selectDirectory.enabled=true;}
   });
   this.sourceButtons=row([this.select,this.selectDirectory]);
   this.fileCombo=new ComboBox(this);this.fileCombo.setScaledMaxWidth(800);
   this.fileCombo.onItemSelected=function(){self.renderHeaders();self.updateDestination();};
   this.search=new Edit(this);this.search.toolTip="Filtra por nombre de keyword o identificador de propiedad";
   this.search.onTextUpdated=function(){self.renderHeaders();};
   this.headers=tree(["Cabecera / propiedad","Valor actual","Comentario","Tipo"],190);
   this.headers.onCurrentNodeUpdated=function(node)
   {
      if(!node)return;
      var i=self.headers.childIndex(node),r=self.visibleRows[i];
      if(!r)return;
      self.detail.text=r.name+"\n"+r.value+"\n"+r.comment;
      if(r.type=="Propiedad")return;
      self.nameEdit.text=r.name;self.valueEdit.text=r.value;self.commentEdit.text=r.comment;
      self.typeCombo.currentItem=r.type=="Número"?1:r.type=="Lógico"?2:0;
      self.markEditorClean();
   };
   this.detail=new TextBox(this);this.detail.readOnly=true;this.detail.setScaledFixedHeight(65);
   this.nameEdit=new Edit(this);this.nameEdit.setScaledMinWidth(110);
   this.typeCombo=new ComboBox(this);this.typeCombo.addItem("Texto");this.typeCombo.addItem("Número");this.typeCombo.addItem("Lógico");
   this.valueEdit=new Edit(this);this.commentEdit=new Edit(this);
   this.editRow=row([label("Cabecera:"),this.nameEdit,label("Tipo:"),this.typeCombo,label("Valor:"),this.valueEdit]);
   this.commentRow=row([label("Comentario:"),this.commentEdit]);
   this.add=button("Añadir / actualizar cambio",function()
   {
      try{self.queueChange({name:self.nameEdit.text.trim().toUpperCase(),type:["Texto","Número","Lógico"][self.typeCombo.currentItem],
                           value:self.typeCombo.currentItem==0?self.valueEdit.text:self.valueEdit.text.trim(),comment:self.commentEdit.text.trim()});self.markEditorClean();}
      catch(e){new MessageBox(String(e),"Revisar cambio",StdIcon_Warning,StdButton_Ok).execute();}
   });
   this.newButton=button("Nueva cabecera",function(){self.resetEditor();});
   this.editButtons=row([this.newButton,this.add]);
   this.pendingLabel=label("Cambios pendientes (se aplican solo los de esta lista):");
   this.pending=tree(["Cabecera","Nuevo valor","Nuevo comentario","Tipo"],85);
   this.pending.onCurrentNodeUpdated=function(node)
   {
      if(!node)return;var c=self.changes[self.pending.childIndex(node)];if(!c)return;
      self.nameEdit.text=c.name;self.valueEdit.text=c.value;self.commentEdit.text=c.comment;
      self.typeCombo.currentItem=c.type=="Número"?1:c.type=="Lógico"?2:0;
      self.markEditorClean();
   };
   this.remove=button("Quitar cambio seleccionado",function()
   {
      var n=self.pending.currentNode;if(!n)return;var i=self.pending.childIndex(n);self.changes.splice(i,1);self.renderChanges();
   });
   this.scope=new ComboBox(this);this.scope.addItem("Todos los archivos seleccionados");this.scope.addItem("Solo el archivo mostrado");
   this.modeCombo=new ComboBox(this);
   this.modeCombo.addItem("Guardar copias en otra carpeta");
   this.modeCombo.addItem("Sobrescribir originales (con respaldo)");
   this.modeCombo.addItem("Sobrescribir originales SIN respaldo");
   this.folderEdit=new Edit(this);this.folderEdit.text="Headers_Metadata";this.folderEdit.readOnly=true;
   this.browseButton=button("Elegir carpeta...",function()
   {
      var picker=new GetDirectoryDialog;picker.caption="Elige la carpeta para las copias";
      if(self.paths.length)picker.initialPath=File.extractDirectory(self.paths[0]);
      if(picker.execute()){self.folderEdit.text=picker.directory;self.updateDestination();}
   });
   this.modeCombo.onItemSelected=function(){self.updateDestination();};
   this.scopeRow=row([label("Aplicar a:"),this.scope,label("Guardado:"),this.modeCombo]);
   this.outputRow=row([label("Carpeta de copias:"),this.folderEdit,this.browseButton]);
   this.destination=label("Selecciona archivos para consultar las cabeceras.");
   this.notice=label("Las keywords de estructura, COMMENT y HISTORY son de solo consulta. Las propiedades XISF se muestran para consulta; FILTER, CREATOR, OBJECT y EXPTIME/EXPOSURE sincronizan su propiedad equivalente.");
   this.simulation=new CheckBox(this);this.simulation.text="Solo simulación (no escribir archivos)";this.simulation.checked=true;
   this.runButton=button("Simular",function()
   {
      try
      {
         self.config=self.makeConfig();
         if(self.config.overwrite && !self.config.dryRun)
            if(new MessageBox("Se sustituirán " + self.config.files.length + " archivos originales por las versiones modificadas.\n" + (self.config.keepBackup ? "Se conservará un respaldo de cada original en Metadata_Backups." : "SIN RESPALDO: no podrás recuperar la versión anterior mediante este script.") + "\n\n¿Continuar?", "Sobrescribir originales",StdIcon_Warning,StdButton_Yes,StdButton_No).execute()!=StdButton_Yes)return;
         self.ok();
      }
      catch(e){new MessageBox(String(e),"Revisar",StdIcon_Warning,StdButton_Ok).execute();}
   });
   this.simulation.onCheck=function(){self.updateDestination();};
   this.cancelButton=button("Cancelar",function(){self.cancel();});
   this.bottom=new HorizontalSizer;this.bottom.spacing=8;this.bottom.add(this.simulation);this.bottom.addStretch();this.bottom.add(this.runButton);this.bottom.add(this.cancelButton);
   this.copyrightLabel=label("Copyright © Carlos Rincón 2026");
   this.sizer=new VerticalSizer;this.sizer.margin=10;this.sizer.spacing=5;
   var items=[this.intro,this.sourceButtons,this.fileCombo,row([label("Buscar:"),this.search]),this.headers,this.detail,this.editRow,this.commentRow,this.editButtons,
              this.pendingLabel,this.pending,this.remove,this.scopeRow,this.outputRow,this.destination,this.notice,this.bottom,this.copyrightLabel];
   for(var i=0;i<items.length;++i)this.sizer.add(items[i]);
   this.nameEdit.onTextUpdated=this.valueEdit.onTextUpdated=this.commentEdit.onTextUpdated=function(){self.updateDraftStatus();};
   this.typeCombo.onItemSelected=function(){self.updateDraftStatus();};
   this.markEditorClean();
   this.adjustToContents();
}
HeaderEditorDialog.prototype=new Dialog;
HeaderEditorDialog.prototype.editorFingerprint=function()
{
   return JSON.stringify([this.nameEdit.text,this.typeCombo.currentItem,this.valueEdit.text,this.commentEdit.text]);
};
HeaderEditorDialog.prototype.markEditorClean=function()
{
   this.editorBaseline=this.editorFingerprint();this.updateDraftStatus();
};
HeaderEditorDialog.prototype.resetEditor=function()
{
   this.nameEdit.text="";this.valueEdit.text="";this.commentEdit.text="";this.typeCombo.currentItem=0;this.markEditorClean();
};
HeaderEditorDialog.prototype.updateDraftStatus=function()
{
   this.pendingLabel.text="Cambios pendientes: "+this.changes.length+
      (this.editorBaseline!=this.editorFingerprint()?" — El campo editado se añadirá al simular o guardar.":" — Puedes añadir varias cabeceras a esta lista.");
};
HeaderEditorDialog.prototype.commitEditorDraft=function()
{
   if(this.editorBaseline==this.editorFingerprint())return;
   this.queueChange({name:this.nameEdit.text.trim().toUpperCase(),type:["Texto","Número","Lógico"][this.typeCombo.currentItem],
      value:this.typeCombo.currentItem==0?this.valueEdit.text:this.valueEdit.text.trim(),comment:this.commentEdit.text.trim()});
   this.markEditorClean();
};
HeaderEditorDialog.prototype.setFiles=function(paths,inputRoot,skipErrors)
{
   if(!paths.length)throw new Error("No se encontraron archivos FITS/XISF.");
   var parent=File.extractDirectory(File.fullPath(paths[0])),root=inputRoot?normalizedHeaderPath(inputRoot):null;
   var snapshots=[],accepted=[],errors=[];
   for(var i=0;i<paths.length;++i)
   {
      var path=normalizedHeaderPath(paths[i]);
      if((root?path.indexOf(root+"/")!=0:File.extractDirectory(path)!=parent) || !/\.(fit|fits|fts|xisf)$/i.test(path))
         throw new Error("Archivo fuera de la carpeta seleccionada: "+path);
      processEvents();if(console.abortRequested)throw new Error("Lectura cancelada");
      try{snapshots.push(readHeaderSnapshot(path));accepted.push(path);}
      catch(e)
      {
         if(!skipErrors)throw e;
         errors.push(path+": "+String(e));console.warningln("Archivo omitido: "+path+": "+String(e));
      }
      if(skipErrors && (i+1)%25==0)console.writeln("Cabeceras leídas: "+(i+1)+"/"+paths.length);
   }
   if(!accepted.length)throw new Error("No se pudo leer ningún archivo; consulta la consola.");
   this.paths=accepted;this.inputRoot=root;this.snapshots=snapshots;this.readErrors=errors;this.changes=[];
   this.fileCombo.clear();
   for(var i=0;i<accepted.length;++i)
      this.fileCombo.addItem((i+1)+"/"+accepted.length+" — "+(root?accepted[i].substring(root.length+1):File.extractNameAndExtension(accepted[i])));
   this.fileCombo.currentItem=0;this.renderHeaders();this.renderChanges();this.resetEditor();this.updateDestination();
};
HeaderEditorDialog.prototype.renderHeaders=function()
{
   this.headers.clear();this.visibleRows=[];
   var rows=this.snapshots[this.fileCombo.currentItem]||[],search=this.search.text.trim().toUpperCase();
   for(var i=0;i<rows.length;++i)
   {
      if(search && rows[i].name.toUpperCase().indexOf(search)<0)continue;
      this.visibleRows.push(rows[i]);var node=new TreeBoxNode(this.headers);
      var cells=[rows[i].name,rows[i].value.replace(/[\r\n]+/g," "),rows[i].comment,rows[i].type];
      for(var c=0;c<cells.length;++c)node.setText(c,cells[c]);
   }
   this.headers.setColumnWidth(0,190);this.headers.setColumnWidth(1,250);this.headers.setColumnWidth(2,260);
};
HeaderEditorDialog.prototype.queueChange=function(change)
{
   var fits=false;for(var i=0;i<this.paths.length;++i)if(!/\.xisf$/i.test(this.paths[i]))fits=true;
   validateChange(change,fits);
   // Avoid conflicting aliases for the same native XISF property.
   var mapping=mappedProperty(change);
   for(var i=0;i<this.changes.length;++i)
   {
      var other=mappedProperty(this.changes[i]);
      if(mapping && other && change.name!=this.changes[i].name && mapping[0]==other[0] && mapping[1]!=other[1])
         throw new Error("EXPTIME y EXPOSURE deben tener el mismo valor.");
      if(this.changes[i].name==change.name){this.changes[i]=change;this.renderChanges();return;}
   }
   this.changes.push(change);this.renderChanges();
};
HeaderEditorDialog.prototype.renderChanges=function()
{
   this.pending.clear();
   for(var i=0;i<this.changes.length;++i)
   {
      var c=this.changes[i],n=new TreeBoxNode(this.pending),cells=[c.name,c.value,c.comment,c.type];
      for(var j=0;j<cells.length;++j)n.setText(j,cells[j]);
   }
   this.pending.setColumnWidth(0,140);this.pending.setColumnWidth(1,220);this.pending.setColumnWidth(2,300);this.updateDraftStatus();
};
HeaderEditorDialog.prototype.outputDirectory=function()
{
   var folder=this.folderEdit.text.trim();
   if (/^(\/|[A-Za-z]:[\\/])/.test(folder))return File.fullPath(folder);
   if(!this.paths.length)return folder;
   return File.extractDirectory(this.inputRoot || File.extractDirectory(File.fullPath(this.paths[0])))+"/"+folder;
};
HeaderEditorDialog.prototype.updateDestination=function()
{
   var overwrite=this.modeCombo.currentItem>0;
   this.folderEdit.enabled=!overwrite;this.browseButton.enabled=!overwrite;
   this.runButton.text=this.simulation.checked?"Simular":overwrite?"Sobrescribir originales":"Guardar copias";
   this.destination.text=!this.paths.length?"Selecciona archivos para consultar las cabeceras.":overwrite?
      (this.modeCombo.currentItem==2?"Se sobrescribirán los originales SIN conservar respaldo.":"Se sustituirán los archivos seleccionados. Respaldo en Metadata_Backups dentro de cada carpeta de origen."):
      "Destino: "+this.outputDirectory()+(this.inputRoot?" (conservando las subcarpetas)":"");
};
HeaderEditorDialog.prototype.makeConfig=function()
{
   if(!this.paths.length)throw new Error("Selecciona archivos primero.");
   this.commitEditorDraft();
   if(!this.changes.length)throw new Error("Escribe una cabecera nueva o añade al menos un cambio a la lista.");
   var files=this.scope.currentItem==1?[this.paths[this.fileCombo.currentItem]]:this.paths.slice(0);
   var src=File.extractDirectory(File.fullPath(files[0])),overwrite=this.modeCombo.currentItem>0;
   var dst=overwrite?src:this.outputDirectory();
   if(!overwrite && !this.folderEdit.text.trim())throw new Error("Elige una carpeta de destino.");
   if(!overwrite && (this.inputRoot || src).toLowerCase()==dst.toLowerCase())throw new Error("Elige otra carpeta o selecciona Sobrescribir originales.");
   // A selected output tree must not also be treated as a source tree.
   if(this.inputRoot && !overwrite)
   {
      var outputPrefix=normalizedHeaderPath(dst).toLowerCase()+"/";
      files=files.filter(function(path){return path.toLowerCase().indexOf(outputPrefix)!=0;});
      if(!files.length)throw new Error("La carpeta de destino contiene todos los archivos seleccionados; elige otra.");
   }
   return {inputDir:src,inputRoot:this.inputRoot,outputDir:dst,files:files,dryRun:this.simulation.checked,overwrite:overwrite,keepBackup:this.modeCombo.currentItem!=2,maxFiles:0,changes:this.changes.slice(0)};
};
#ifndef METADATA_LIBRARY
try
{
   var dialog=new HeaderEditorDialog;
   if(dialog.execute())
   {
      var result=runHeaderBatch(dialog.config);
      new MessageBox((dialog.config.dryRun?"Simulación terminada":"Guardado terminado")+"\nSimulados: "+result.simulated+"\nGuardados: "+result.saved+
         "\nSobrescritos: "+result.overwritten+"\nOmitidos: "+result.skipped+"\nErrores: "+result.errors+"\nConsulta la consola para más detalles.","Editor de cabeceras",StdIcon_Information,StdButton_Ok).execute();
   }
}
catch(e){new MessageBox(String(e),"Error",StdIcon_Error,StdButton_Ok).execute();}
#endif
