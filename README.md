# pixinsight-scripts

Scripts para PixInsight de crinconlab y preparación de su repositorio de actualizaciones.

**Estado: desarrollo. Hay tres scripts provisionales; todavía no hay una versión publicada mediante el gestor de actualizaciones.**

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/scripts/crinconlab/` | Scripts, firmas públicas y recursos que se instalarán |
| `tools/build_release.py` | Preparación local del ZIP y del índice `updates.xri` |
| `release.example.json` | Plantilla de metadatos para una publicación |
| `build/` | Resultados locales, pendientes de firma y comprobación; ignorados por Git |
| `repository/` | Paquetes e índice definitivos, cuando se publique la primera versión |
| `docs/publicacion.md` | Procedimiento de firma, empaquetado y actualización |

## Próximo paso

Trabajar sobre los scripts provisionales, revisar sus dependencias y comprobarlos en PixInsight antes de preparar la primera versión firmada. Véase [Estado de desarrollo](docs/desarrollo.md). Las claves `.xssk` y su contraseña permanecen fuera del repositorio.

La guía [Publicar una versión](docs/publicacion.md) explica el procedimiento. El empaquetador requiere Python 3.9 o posterior y solo utiliza la biblioteca estándar.

## Dirección prevista para PixInsight

```text
https://raw.githubusercontent.com/crinconlab/pixinsight-scripts/main/repository/
```

Esta dirección se podrá añadir al gestor de actualizaciones cuando contenga el primer `updates.xri` y su paquete comprobado. No es necesario activar GitHub Pages para este alojamiento.

## Validación pendiente

Las comprobaciones del empaquetador no ejecutan PixInsight ni verifican criptográficamente las firmas. Antes de la primera entrega hay que comprobar la firma, una instalación nueva y una actualización desde una versión anterior dentro de PixInsight.

## Probar la mezcla de focales

La versión de desarrollo [Mezcla_Focales.js](src/scripts/crinconlab/Mezcla_Focales.js) trabaja con imágenes estiradas y sin estrellas, ya registradas, y una máscara de cobertura. Permite dibujar un polígono sobre el detalle, mover sus vértices y previsualizar su transición, seleccionar una banda de detalle, ajustar intensidad y ganancia y comparar a resolución completa sin aplicar STF.

Consulta [entradas, controles, método y límites](docs/mezcla-focales.md). Las pruebas fuera de PixInsight se ejecutan con `node --test tests/mezcla_focales.test.cjs`. La ejecución con los procesos y la interfaz nativos sigue pendiente; se incluye una [prueba sintética para PixInsight](tests/Test_Mezcla_Focales_PixInsight.js).

El [icono SVG](src/scripts/crinconlab/Mezcla_Focales.svg) debe guardarse junto al archivo JavaScript al instalarlo.

