# pixinsight-scripts

Scripts para PixInsight de astrocrincon y preparación de su repositorio de actualizaciones.

**Estado: desarrollo. Hay dos scripts provisionales; todavía no hay una versión publicada mediante el gestor de actualizaciones.**

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/scripts/astrocrincon/` | Scripts, firmas públicas y recursos que se instalarán |
| `tools/build_release.py` | Preparación local del ZIP y del índice `updates.xri` |
| `release.example.json` | Plantilla de metadatos para una publicación |
| `build/` | Resultados locales, pendientes de firma y comprobación; ignorados por Git |
| `repository/` | Paquetes e índice definitivos, cuando se publique la primera versión |
| `docs/publicacion.md` | Procedimiento de firma, empaquetado y actualización |

## Próximo paso

Trabajar sobre los dos scripts provisionales, revisar sus dependencias y comprobarlos en PixInsight antes de preparar la primera versión firmada. Véase [Estado de desarrollo](docs/desarrollo.md). Las claves `.xssk` y su contraseña permanecen fuera del repositorio.

La guía [Publicar una versión](docs/publicacion.md) explica el procedimiento. El empaquetador requiere Python 3.9 o posterior y solo utiliza la biblioteca estándar.

## Dirección prevista para PixInsight

```text
https://raw.githubusercontent.com/astrocrincon/pixinsight-scripts/main/repository/
```

Esta dirección se podrá añadir al gestor de actualizaciones cuando contenga el primer `updates.xri` y su paquete comprobado. No es necesario activar GitHub Pages para este alojamiento.

## Validación pendiente

Las comprobaciones del empaquetador no ejecutan PixInsight ni verifican criptográficamente las firmas. Antes de la primera entrega hay que comprobar la firma, una instalación nueva y una actualización desde una versión anterior dentro de PixInsight.
