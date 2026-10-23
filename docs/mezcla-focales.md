# Mezcla de focales — 0.3.1 de desarrollo

Primera implementación para combinar una base de gran campo con el detalle de una focal larga, sobre imágenes **ya estiradas y sin estrellas**. No se aplica STF adicional.

## Instalar para probar

1. Descargar `src/scripts/crinconlab/Mezcla_Focales.js` y `src/scripts/crinconlab/Mezcla_Focales.svg` y guardarlos juntos en una carpeta permanente. El SVG es el icono del script: dos cuadrados concéntricos unidos por sus vértices.
2. En PixInsight, abrir **Script → Feature Scripts… → Add** y seleccionar esa carpeta.
3. Ejecutar **Script → Utilities → Mezcla de focales**. También se puede abrir el archivo en el editor de scripts y ejecutarlo desde allí.

El cálculo está contenido en un único archivo JavaScript, aparte de cabeceras y procesos estándar de PixInsight; el SVG aporta el icono mediante `#feature-icon`. Está escrito para el motor V8. No requiere ImageSolver ni SPCC. Todavía no está firmado ni publicado mediante el gestor de actualizaciones. La carga del icono en PixInsight está pendiente de comprobación nativa.

## Preparar las entradas

- **Base**: imagen de gran campo estirada y sin estrellas, RGB o monocroma.
- **Detalle**: imagen de la focal larga, estirada y sin estrellas, RGB o monocroma.
- **Máscara**: imagen monocroma con la geometría de cobertura válida del detalle. Blanco incorpora detalle; negro conserva la base. Puede tener transiciones grises.

Las tres imágenes deben tener las mismas dimensiones y estar registradas sobre la misma cuadrícula. Coincidir en dimensiones no demuestra que estén alineadas. No se admiten previews ni canales alfa.

La primera versión **no registra ni remuestrea**. Conviene hacer el registro con imágenes con estrellas, y utilizar esa misma transformación en las versiones sin estrellas. La posición y el recorte de la máscara también deben coincidir.

La cuadrícula de la base determina la escala y dimensiones del resultado. Para conservar el muestreo de la focal larga, hay que preparar previamente la base sobre una cuadrícula que lo conserve. Ampliar el campo amplio no crea detalle fuera del campo de la focal larga y puede aumentar mucho el consumo de memoria.

### Máscara de cobertura

No se deduce la cobertura del brillo del detalle: una nebulosa oscura puede contener píxeles casi negros que siguen siendo válidos. Se puede crear la máscara dentro del script o seleccionar una imagen monocroma preparada externamente.

1. Seleccionar la imagen de **Detalle** ya registrada sobre la cuadrícula de salida y pulsar **Crear máscara…**.
2. Pulsar en orden sobre el panel de detalle para marcar los vértices de un polígono completamente dentro del campo válido. Se empieza sin contorno; se admiten de **3 a 64 vértices**, en cualquier sentido. Cerrar pulsando el primer vértice o **Cerrar polígono**. Para un campo rectangular girado bastan sus cuatro esquinas interiores.
3. Arrastrar un vértice para moverlo, o elegir su número y ajustar **x** e **y** en píxeles. **Deshacer** reabre un contorno cerrado; otra pulsación elimina el último vértice. **Borrar contorno** permite empezar de nuevo. **Todo el lienzo** sirve cuando el detalle cubre realmente la imagen completa. Elegir la **Transición (px)** y pulsar **Previsualizar transición**. El panel derecho muestra la máscara efectiva, calculada a resolución completa con el mismo método que la mezcla. Blanco incorpora detalle; gris mezcla parcialmente; negro conserva la base. Si se modifica el contorno o la transición, se borra la vista anterior hasta recalcularla.
4. Pulsar **Crear y seleccionar máscara**. Se abre una nueva imagen monocroma, sin sobrescribir ninguna existente, y queda seleccionada en el diálogo principal. La transición elegida también pasa al diálogo principal.

La imagen creada conserva un **polígono blanco de bordes duros sobre negro**. Las coordenadas de sus vértices representan límites de píxel entre `0` y el ancho/alto del lienzo; cada píxel se incluye según la posición de su centro. La transición se aplica una sola vez al preparar la mezcla, hacia dentro de ese soporte. Por eso la imagen conservada y la vista de la máscara efectiva tienen distinto aspecto cuando la transición es mayor que cero. La máscara creada permanece abierta aunque después se cancele la mezcla; se puede guardar o reutilizar. Cancelar el editor no crea una máscara y las previsualizaciones no dejan ventanas temporales abiertas.

El editor muestra el detalle estirado sin STF y ajustado al panel; para precisar el borde se usan las coordenadas. El cálculo a resolución completa puede tardar y bloquear temporalmente el diálogo en imágenes grandes. No modifica los píxeles ni las selecciones del detalle original.

Se admiten contornos convexos y cóncavos. El script rechaza vértices repetidos, aristas que se cruzan, se tocan o retroceden sobre sí mismas y polígonos sin superficie. Esta versión utiliza un único contorno, sin agujeros ni regiones desconectadas; para esos casos se puede aportar una máscara externa. El usuario delimita la cobertura: no hay detección automática del campo ni de píxeles defectuosos. No usar como máscara una copia de la luminancia de la nebulosa.

## Controles y primera prueba

1. Elegir base y detalle, crear o seleccionar la máscara y confirmar la preparación de las entradas.
2. Empezar con **sigma menor 1**, **sigma mayor 4** y **transición 32**, todos en píxeles de la cuadrícula de salida. La transición debe adaptarse al tamaño de la zona cubierta y al suavizado previo de la máscara.
3. Preparar la comparación. Se calcula la banda a resolución completa.
4. La intensidad inicial es **35 %** y la ganancia relativa **1**. Cambiar los valores y pulsar **Actualizar comparación**. Cada actualización parte de las mismas copias iniciales.
5. Usar **Campo completo**, **100 %**, los botones de zoom, la rueda y el arrastre para inspeccionar las mismas zonas en ambos paneles.
6. **Conservar resultado** mantiene la imagen ya calculada; no repite la mezcla y no guarda un archivo. **Volver** permite cambiar entradas o escalas. **Descartar y cerrar** elimina los temporales.

La comparación es una representación de pantalla con bitmap. No es una lectura fotométrica, y no se ha validado aquí la gestión de color de esa representación. Al conservar el resultado, revisarlo también en la ventana nativa de PixInsight con los ajustes de visualización apropiados.

## Método

En RGB se extrae la componente CIE L*; en monocromo se utiliza directamente la imagen. La banda de detalle es la diferencia entre dos gaussianas, con sigmas menor y mayor. **No son las capas de MultiscaleLinearTransform**, y sigma no es un tamaño exacto de estructura.

Los suavizados se normalizan con la máscara de cobertura:

```text
Suavizado(X, sigma) = Gsigma(X · M) / max(Gsigma(M), 1e-6)
Banda(X) = Suavizado(X, sigma_menor) − Suavizado(X, sigma_mayor)
L_resultado = limitar_a_0_1(L_base + intensidad · M_efectiva · (ganancia · Banda(detalle) − Banda(base)))
```

Normalizar ambos campos con la misma máscara evita introducir directamente los bordes negros de un detalle registrado sobre un lienzo mayor. La máscara efectiva tiene transición adicional hacia dentro y mantiene a cero el exterior de la máscara original. Con transición 0 se utiliza directamente la máscara original limitada a 0–1.

Se reemplaza de forma parcial el detalle de la base en esa banda, en vez de sumarlo por duplicado. Las estructuras mayores quedan en la base antes de los posibles efectos de limitación a 0–1 y de la conversión de color.

El ajuste automático estima una pendiente entre estructuras suavizadas de base y detalle dentro de la cobertura. El término aditivo del ajuste no se incorpora: una diferencia de gaussianas ya elimina un desplazamiento constante. Si la estimación no tiene suficientes muestras, variación o correlación, se utiliza ganancia 1 y se muestra un aviso. La ganancia relativa permite corregirla manualmente; no cambia el color de origen.

Este ajuste **no es una calibración fotométrica**. Estirados y respuestas espectrales distintos pueden requerir desactivarlo y revisar manualmente la mezcla.

En RGB, la nueva componente de luminosidad se incorpora con LRGBCombination, con parámetros de transferencia neutros y reducción de ruido desactivada. El color procede de la base. Los cambios de luminosidad y los colores fuera de gama pueden modificar el aspecto; no se garantiza identidad fotométrica ni de color.

## Comprobaciones y límites

Las imágenes originales no se procesan ni se sobrescriben. Se restauran sus selecciones de canal y rectángulo al copiarlas. Los cálculos usan temporales de 32 bits reales, con trabajo interno de PixelMath en 64 bits. No se copian máscaras activas de los originales ni se aplican sus STF. Los metadatos FITS y la solución astrométrica del resultado proceden de la base.

Un cambio de intensidad o ganancia desactiva la aceptación hasta actualizar. Si falla el cálculo o la representación de una nueva comparación, se mantiene la última comparación válida. Volver y cerrar limpian solo ventanas propiedad del script. Un cierre forzado de PixInsight puede dejar temporales abiertos.

La implementación mantiene varias imágenes a resolución completa; con imágenes de 26 megapíxeles puede utilizar varios GB, además de los originales. El objetivo de la banda seleccionada es aportar detalle existente, pero también puede transferir ruido o artefactos de registro y procesado. No se detectan automáticamente estrellas residuales, diferencias de PSF o de estructura entre filtros.

### Comprobaciones realizadas fuera de PixInsight

```bash
node --test tests/mezcla_focales.test.cjs
```

Hay 26 pruebas. Se comprueban geometría de las entradas, identidad con intensidad cero y con entradas iguales, cobertura, conservación de originales, independencia de ensayos, errores y limpieza de temporales, bloqueo de aceptación desactualizada, estimación de ganancia y geometría de navegación. También se comprueban la conversión de coordenadas en un panel con márgenes, cobertura girada y cóncava, independencia del sentido y del primer vértice, lienzo completo, cierre y deshacer, límite de vértices, rechazo de contornos ambiguos, creación de cobertura independiente del brillo, coincidencia entre la máscara previsualizada y la de la mezcla, ausencia de doble suavizado y limpieza tras fallos de creación o representación.

Ocho de esas pruebas instancian las clases reales de los diálogos sobre controles simulados y ejecutan sus callbacks: clics y cierre por el primer vértice, arrastre del vértice cero, edición numérica, invalidación de la vista, bloqueo de cruces, deshacer y borrar, cancelación, creación y reintento tras errores, transferencia de máscara y transición al diálogo principal, aceptación de la comparación y navegación sincronizada. Los controles registran las órdenes de dibujo. Estas pruebas comprueban la lógica de interacción; no muestran una interfaz ni verifican el diseño visual, los eventos de Qt o las API nativas. Los procesos PJSR también se representan mediante adaptadores en memoria.

### Pendiente en PixInsight

No hay una instalación de PixInsight ni un escritorio gráfico en este entorno. Se incluye `tests/Test_Mezcla_Focales_PixInsight.js` para ejecutar una prueba sintética de los procesos nativos y de callbacks del editor de máscara con controles PJSR reales. Descargar el repositorio completo y conservar las rutas; ejecutar ese archivo desde el editor de scripts. La prueba crea y elimina únicamente sus propias imágenes sintéticas y temporales. Los callbacks se invocan desde el código, sin abrir el diálogo modal: su ejecución no sustituye la prueba visual. Este archivo nativo no se ha ejecutado aquí.

Después hay que comprobar visualmente el editor de máscara (clics para añadir y cerrar, arrastre de vértices, coordenadas, deshacer, borrar, transición, cancelar y selección de la nueva imagen), el diálogo de mezcla, el zoom y el desplazamiento, y probar una pareja real de imágenes. Revisar especialmente el borde de cobertura, zonas de polvo tenue, ruido y crominancia antes de considerar una primera versión distribuible.

