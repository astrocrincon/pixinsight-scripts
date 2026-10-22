# pixinsight-scripts

Scripts para PixInsight de astrocrincon y preparación de su repositorio de actualizaciones.

**Estado: preparación inicial. Todavía no hay ningún script ni actualización instalable.**

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

Incorporar la versión actual del script y sus dependencias, indicar las versiones de PixInsight comprobadas y completar el registro CPD. Las claves `.xssk` y su contraseña permanecen fuera del repositorio.

La guía [Publicar una versión](docs/publicacion.md) explica el procedimiento. El empaquetador requiere Python 3.9 o posterior y solo utiliza la biblioteca estándar.

## Dirección prevista para PixInsight

```text
https://raw.githubusercontent.com/astrocrincon/pixinsight-scripts/main/repository/
```

Esta dirección se podrá añadir al gestor de actualizaciones cuando contenga el primer `updates.xri` y su paquete comprobado. No es necesario activar GitHub Pages para este alojamiento.

## Validación pendiente

Las comprobaciones del empaquetador no ejecutan PixInsight ni verifican criptográficamente las firmas. Antes de la primera entrega hay que comprobar la firma, una instalación nueva y una actualización desde una versión anterior dentro de PixInsight.
