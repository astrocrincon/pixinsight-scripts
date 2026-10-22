# Estado de desarrollo

Los dos scripts recibidos el 22 de octubre de 2026 se han incorporado sin modificar su contenido. Son versiones provisionales para continuar el desarrollo. No se han firmado, empaquetado ni publicado como actualizaciones.

## Scripts incorporados

| Archivo | Versión declarada | Dependencias observadas |
| --- | --- | --- |
| `Editor_Cabeceras_FITS_XISF.js` | Sin versión propia explícita en la cabecera | Cabeceras PJSR de tipos, interfaz e iconos proporcionadas por PixInsight |
| `RGB_DualBand_Solver_SPCC.js` | 0.13 en la información del script | PixInsight 1.9.5 como mínimo según el código, motor V8, bibliotecas PJSR de astrometría, ImageSolver y SPCC |

Los archivos están en [src/scripts/astrocrincon/](../src/scripts/astrocrincon/). Las dependencias de PixInsight no se han copiado al repositorio.

## Antes de una primera distribución

- Decidir qué cambios funcionales necesita cada script y hacerlos sobre estas versiones de desarrollo.
- Definir la versión del editor y un criterio de versiones para la colección.
- Comprobar las versiones de PixInsight compatibles con cada script; la llamada de versión mínima del RGB no demuestra que se haya probado en todas las versiones posteriores.
- Revisar las inclusiones `<../src/scripts/ImageSolver/ImageSolverDialog.js>` y `<../src/scripts/ImageSolver/ImageSolverEngine.js>` del RGB desde la ubicación final de instalación. El código y su ayuda dependen de ImageSolver 6.5.0; hay que comprobar la resolución de rutas y la compatibilidad con esos componentes antes de empaquetar.
- Revisar los identificadores y las dependencias de los scripts antes de la firma CPD.
- Probar en PixInsight el editor, la composición RGB/Dual Band, la resolución astrométrica y SPCC con datos reales. La ayuda incluida en el RGB describe comprobaciones previas; no se han reproducido durante esta incorporación.
- Preparar firmas, paquete e índice solo cuando se elija una versión candidata a distribución.

## Comprobación de esta incorporación

Se han revisado cabeceras y referencias de dependencias y se ha comprobado la identidad byte a byte mediante hashes. No se ha ejecutado PixInsight ni realizado una revisión funcional completa.

SHA-256 de los archivos recibidos:

| Archivo | SHA-256 |
| --- | --- |
| `Editor_Cabeceras_FITS_XISF.js` | `6a04df2145d08f0e7227cc2bc9c258c15ac52fe6d2e22bd0dd8cf6cd0d41e44c` |
| `RGB_DualBand_Solver_SPCC.js` | `596c04356b6febc026f696e53ca5dca3902b06ae4f3e96f9a227216a0979ce2c` |

La carpeta `repository/` continúa sin `updates.xri` ni paquetes instalables. Guardar el código fuente en GitHub permite mantener su historial mientras se desarrolla.
