# Publicar una versión

## Lo que ya está preparado

El alojamiento será la carpeta `repository/` de la rama `main`, accesible como archivos sin procesar desde GitHub. No hace falta configurar GitHub Pages ni contratar un servidor.

La herramienta Python prepara un paquete con todos los scripts indicados en una configuración y un índice **sin firmar**. No compila JavaScript, no genera firmas y no publica archivos.

## Preparar el primer script

1. Guardar el código bajo `src/scripts/astrocrincon/NombreDelScript/` y añadir sus dependencias e iconos. Las rutas del ZIP conservarán el prefijo `src/`, que corresponde al árbol de instalación de PixInsight.
2. Revisar en el código `#feature-id`, versión, categoría del menú y rutas relativas. El identificador de desarrollador CPD es el aprobado por PixInsight; no hay que deducirlo del usuario de GitHub ni de esta carpeta.
3. Copiar `release.example.json` como `release.json`. Este último es configuración local e inicialmente está ignorado por Git.
4. Rellenar nombre, descripción, versión y un `package_id` estable. Indicar en `pixinsight_versions` el intervalo **comprobado** de PixInsight con formato `mínimo:máximo`, por ejemplo `1.9.3:1.9.4`. El ejemplo ilustra el formato, no certifica esa compatibilidad.
5. En `files`, enumerar todos los archivos que se instalarán, con rutas relativas a `src/`. Incluir `.jsh`, imágenes y otros recursos necesarios. En `entrypoints`, enumerar los `.js` que se ejecutarán desde PixInsight y que se firmarán.

Para comenzar se utiliza un solo paquete que contiene la colección completa. Cuando se incorporen más scripts, añadirlos todos a la configuración del paquete. **El generador escribe un índice de un solo paquete**: no combina índices ni mantiene otras entradas que se hubieran añadido manualmente.

## Firmar y preparar el paquete en tu Mac

1. Probar la versión final dentro de PixInsight.
2. Firmar cada script de entrada con las herramientas de firma de PixInsight y tu identidad CPD. Guardar su firma pública `.xsgn` junto al `.js`, sustituyendo la extensión. Por ejemplo, `MiScript.js` y `MiScript.xsgn`.
3. Volver a firmar si se modifica el script o una dependencia incluida. El empaquetador no usa fechas de modificación para detectar firmas antiguas y no comprueba criptográficamente su contenido.
4. Desde Terminal, situarse en la carpeta del repositorio y ejecutar, cambiando la fecha por la de la publicación:

   ```bash
   python3 tools/build_release.py --config release.json --release-date 20261022
   ```

5. Dentro de `build/` aparecerá una carpeta con el ZIP y `updates.xri`. El ZIP incluye las firmas de los puntos de entrada. Su nombre contiene versión y una parte del SHA-256 de su contenido; el índice contiene el SHA-1 requerido para el paquete.
6. Firmar ese `updates.xri` con el sistema de firma XML de PixInsight. No regenerar ni editar el índice después de firmarlo.
7. Comprobar las firmas en PixInsight. La existencia de `.xsgn` no prueba que la firma sea válida ni que la identidad sea reconocida por otra instalación.

Las claves `.xssk` y la contraseña se conservan fuera de esta carpeta. El empaquetador rechaza rutas de claves privadas y enlaces simbólicos, pero hay que revisar igualmente los archivos seleccionados. Las firmas `.xsgn` son públicas y sí se pueden distribuir.

## Publicar en GitHub

Después de comprobar el resultado:

1. Copiar el ZIP y el índice firmado desde la carpeta de `build/` a `repository/`. Conservar los ZIP anteriores.
2. Revisar que `fileName` en el índice corresponde al ZIP nuevo y que no se han cambiado los bytes del ZIP desde el cálculo del checksum.
3. Subir **el ZIP y el índice en el mismo commit**. Con GitHub en Firefox, se puede abrir `repository/`, elegir **Add file → Upload files**, arrastrar ambos archivos y confirmar el commit. No subir toda la carpeta `build/`.
4. Comprobar que se descargan ambos archivos por sus direcciones `raw.githubusercontent.com`. Si se usa otro alojamiento, cargar el ZIP primero y el índice al final.

La dirección que se añadirá a PixInsight será:

```text
https://raw.githubusercontent.com/astrocrincon/pixinsight-scripts/main/repository/
```

No añadir todavía esta dirección: primero debe existir una publicación real. GitHub puede servir contenido desde caché; confirmar que el índice descargado es el recién publicado antes de comprobar actualizaciones.

## Comprobar la distribución

En una instalación de prueba de PixInsight, añadir la dirección en **Resources → Updates → Manage Repositories** y buscar actualizaciones. Comprobar:

- Instalación nueva, rutas de recursos y aparición del script en el menú.
- Ejecución del script con una identidad CPD reconocida en esa instalación.
- Actualización desde la versión anterior, respetando los reinicios solicitados por PixInsight.

La preparación inicial del repositorio no equivale a superar estas pruebas. No se han realizado todavía porque aún falta el código real y la firma CPD.

Para cada versión: terminar cambios, probar, volver a firmar los scripts, preparar el ZIP y el índice, firmar el índice y publicar los dos archivos definitivos. Los usuarios recibirán las nuevas versiones mediante el gestor de actualizaciones de PixInsight.

## Referencias

- [PixInsight Update Repositories](https://pixinsight.com/doc/docs/PIRepositoryReference/PIRepositoryReference.html)
- [The PixInsight Code Signing System](https://pixinsight.com/doc/docs/CodeSigning/CodeSigning.html)
- [Implementación de referencia: repositorio de Benny Colyn](https://github.com/bcolyn/PixInsightScripts/blob/master/release/updates.xri)

El formato inicial del índice se ha contrastado con el repositorio público citado. La documentación oficial no se pudo recuperar íntegra durante la preparación; antes de entregar la primera versión hay que validar el resultado con la versión de PixInsight utilizada.
