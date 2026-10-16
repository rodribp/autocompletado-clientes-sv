# Autocompletado de clientes — factura.gob.sv

Extensión de Chrome, libre y gratuita, que guarda la información fiscal de tus clientes
y tus productos o servicios, y rellena de un clic la sección **Receptor** y la ventana de
**ítems** de las facturas y créditos fiscales en <https://admin.factura.gob.sv>.

El portal gratuito del Ministerio de Hacienda permite emitir hasta 100 documentos al mes,
pero —a diferencia de los sistemas de pago— no trae base de datos de clientes. Esta
extensión aporta esa pieza sin que tengas que cambiar de sistema ni pagar una suscripción.

## Qué hace

- Guarda tus clientes **en tu propio navegador**: nombre, NIT o DUI, NRC, nombre comercial,
  actividad económica, dirección completa, correo y teléfono.
- Rellena el receptor de una **Factura (CF)** o un **Crédito Fiscal (CCF)** con un clic,
  incluida la cascada departamento → municipio → distrito. Puedes hacerlo desde el icono o,
  más rápido, escribiendo en **Nombre**, **NIT** o **NRC** del Receptor y eligiendo al cliente
  de la lista que aparece debajo.
- **«Guardar cliente actual»**: rellena un documento a mano una sola vez y la extensión se
  queda con los datos exactos, incluidos los códigos de municipio, distrito y actividad que
  el portal no publica en ninguna parte legible.
- Guarda tus **productos y servicios** (descripción, tipo, unidad, tipo de venta, código y
  precio final) y te los sugiere mientras escribes en la ventana «Producto o Servicio» del
  portal.
- Guardas el precio final, lo que paga el cliente, y la extensión lo ajusta al documento. Si
  el producto es gravado, en la **Factura** va tal cual (con el IVA incluido) y en el
  **Crédito Fiscal** va sin IVA (÷ 1.13), porque el portal lo suma después. Los productos
  exentos o no sujetos llevan el mismo precio en los dos.
- Respaldo en JSON para llevarte tus clientes y productos a otra computadora.
- Avisa cuando a un cliente le falta algo para poder recibir un crédito fiscal
  (sin NIT ni DUI, o sin NRC).

## Instalación (sin compilar nada)

1. Descarga el `.zip` de la [última versión publicada](../../releases/latest) y
   descomprímelo en una carpeta que no vayas a borrar ni mover.
2. Abre `chrome://extensions`.
3. Activa el **Modo de desarrollador**, arriba a la derecha.
4. Pulsa **Cargar descomprimida** y elige la carpeta que descomprimiste.

> Chrome desactivará la extensión si mueves o borras esa carpeta.

## Uso

1. Entra a <https://admin.factura.gob.sv> y abre una Factura o un Crédito Fiscal.
   El icono de la extensión mostrará `CF` o `CCF`.
2. Escribe en **Nombre**, **NIT** (o número de documento en la Factura) o **NRC** del
   Receptor: debajo aparecen tus clientes que coinciden, por nombre sin importar acentos o por
   los dígitos del NIT/DUI y del NRC. Elige uno con el ratón o con `↓` y `Enter`. También
   puedes pulsar el icono, buscar al cliente y darle a **Rellenar**. Al cambiar de cliente se
   vacían los datos de texto que el nuevo no tenga (correo, teléfono, NRC…).
3. ¿Cliente nuevo? Rellena el receptor como siempre y pulsa **Guardar cliente actual**:
   la extensión lee lo que está en pantalla y te abre el formulario ya lleno para que
   solo revises y guardes.

4. Para un producto: guárdalo una vez en la pestaña **Productos** del icono. Luego, en el
   portal, abre **Agregar Ítem** (o **Agregar Detalle**) → **Producto o Servicio** y empieza
   a escribir en **Producto** o **Código**. Debajo aparecen tus productos guardados que
   coinciden; elige uno con el ratón o con `↓` y `Enter`, y la ventana se rellena entera (se
   respeta la cantidad que ya hayas escrito). Revisa y pulsa **Agregar ítem**.

Atajos dentro del popup: `/` enfoca el buscador, `↑`/`↓` recorren la lista,
`Enter` rellena el cliente marcado, `Esc` sale de la edición.

## Privacidad

Tus datos **nunca salen de tu navegador**. Se guardan con `chrome.storage.local`, en tu
perfil de Chrome. La extensión:

- no envía nada a ningún servidor;
- no usa `chrome.storage.sync`, así que tampoco viajan a la nube de Google;
- solo tiene permiso para actuar en `https://admin.factura.gob.sv/*`.

Ver [PRIVACY.md](PRIVACY.md).

## Limitaciones conocidas

- Solo cubre el **receptor** y los **ítems de producto o servicio** de Factura y Crédito
  Fiscal. «Monto No Afecto», «Otros tipos de impuesto», los descuentos y el resto de tipos de
  documento quedan fuera por ahora.
- Antes de rellenar, la extensión vuelve a validar el producto elegido. Si un dato guardado
  no es válido (por ejemplo, un precio negativo), no rellena nada y te dice qué corregir.
- La actividad económica se elige simulando la búsqueda en el desplegable del portal. Si el
  código no aparece en su lista, la extensión te avisa y te deja copiarlo para ponerlo a mano.
- Los códigos de municipio y distrito se **aprenden** de la propia página. Al principio el
  formulario de alta te pedirá escribirlos a mano; después de rellenar un par de documentos
  ya tendrás desplegables.
- Cuando el portal cambie su maquetación, la extensión avisará en vez de rellenar mal.
  El botón **Diagnóstico** (menú `⋯`) dice exactamente qué campos dejó de encontrar.

## Desarrollo

Requiere Node 20 o superior.

```sh
npm ci
npm run watch     # recompila a dist/ al guardar
npm run typecheck
npm test
npm run build     # compilación única
npm run zip       # empaqueta dist/ para distribuir
```

Carga la carpeta `dist/` con «Cargar descomprimida».

### Cómo está organizado

| Ruta | Qué hay |
| --- | --- |
| `src/common/` | Modelo de datos, validación, almacenamiento, catálogo y mensajes |
| `src/content/` | Content script: detección, lectura y relleno del formulario |
| `src/content/forms/cf.ts`, `ccf.ts` | Tablas declarativas de campos, una por formulario |
| `src/popup/` | Interfaz del popup |
| `tests/` | Pruebas unitarias y de DOM |

Cuando el portal cambie, lo que casi siempre habrá que tocar son esas dos tablas de campos.

### Pruebas

`tests/dom/` trabaja sobre capturas del formulario del portal, que **no se versionan**.
Sin ellas, esas pruebas se saltan solas y el resto sigue corriendo. Cómo generarlas:
`tests/README.md`.

Ojo con lo que esas pruebas pueden demostrar: Angular no está en ejecución, así que validan
**selectores y recorrido del DOM**, no el ciclo de eventos. Lo demás hay que verificarlo
contra el portal real; la lista de comprobación está en `tests/README.md`.

## Licencia

Copyright (C) 2026 Rodrigo Bonilla

GNU General Public License v3.0 o posterior (GPL-3.0-or-later). Ver [LICENSE](LICENSE).

## Aviso legal

Proyecto independiente. No está afiliado al Ministerio de Hacienda de El Salvador ni
cuenta con su respaldo. Se limita a escribir en un formulario que de todos modos ibas a
llenar a mano.
