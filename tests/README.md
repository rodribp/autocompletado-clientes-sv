# Pruebas

```sh
npm test        # compila tests/ a .tmp/ y corre node --test
```

## Qué prueba qué

| Archivo | Cubre |
| --- | --- |
| `unit/validate.test.ts` | Reglas de NIT, DUI, NRC, correo y teléfono en forma canónica |
| `unit/normalize.test.ts` | Ida y vuelta entre lo que guardamos y lo que mostramos |
| `unit/storage.test.ts` | CRUD, migraciones, búsqueda, respaldos, y los dos fallos de la versión previa |
| `unit/types.test.ts` | Aptitud para crédito fiscal |
| `dom/scoping.test.ts` | **La más importante.** Que nunca escribamos en la pestaña Emisor |
| `dom/detect.test.ts` | Detección de página y resolución de la raíz del receptor |
| `dom/descriptors.test.ts` | Que cada campo declarado resuelva a un único elemento |
| `dom/selects.test.ts` | Que los desplegables se coteje por código y nunca por texto |
| `dom/docnumber.test.ts` | El hueco diferido del número de documento en CF |
| `dom/ngselect.test.ts` | El driver de `<ng-select>` contra un doble sintético |

## Los snapshots no están versionados

Las pruebas de `dom/` necesitan `cf.html` y `ccf.html`, capturas del formulario del portal.
No se versionan, así que hay que generarlas: abre `/cf` y `/ccf` y guarda cada página con
«Guardar como… → Página web completa». Déjalas en `fixtures/`, o apunta a donde las tengas:

```sh
SNAPSHOTS_DIR=mi-carpeta npm test
```

**Cuando no están, esas pruebas se saltan solas** en vez de fallar; en CI corren únicamente
las unitarias y la de humo del popup.

## Qué NO pueden demostrar estas pruebas

En jsdom **Angular no está corriendo**. En consecuencia:

- ningún `*ngIf` renderiza, así que el campo de número de documento de CF nunca aparece;
- la cascada departamento → municipio → distrito nunca se dispara;
- ningún evento llega a un `ControlValueAccessor`, ni a ngx-mask, ni a ng-select.

O sea: validan **selectores y recorrido del DOM**, que es justo donde un cambio del portal
—o un descuido nuestro con las colisiones Emisor/Receptor— rompería las cosas en silencio.
Que el valor *llegue* al formulario hay que comprobarlo a mano.

Un detalle más: al re-parsear `ccf.html`, el parser descarta el `<form>` que está anidado
dentro de `app-common-receptor` (un `<form>` dentro de otro es HTML inválido). Por eso nada
se ancla en ese formulario, ni en las pruebas ni en el código.

## Verificación manual contra el portal real

Hay que hacerla al menos una vez por versión publicada.

1. Cargar `dist/` descomprimida; abrir `/ccf`; el icono muestra `CCF`.
2. Rellenar el receptor a mano → **Guardar cliente actual** → el formulario aparece con
   todo puesto, incluidos el código de actividad y los nombres de municipio y distrito.
3. Recargar la página, elegir ese cliente → **Rellenar** → caen los 11 campos, **y la
   pestaña Emisor queda intacta**. Esto último es lo más importante de toda la lista.
4. `/cf` con un cliente de tipo NIT: el tipo pasa a `36`, aparece el campo de número y
   recibe los dígitos, la cascada termina, la actividad muestra la etiqueta correcta.
5. Repetir el paso 4 con DUI (`13`) y con Pasaporte (`03`).
6. Un cliente de un departamento distinto al que esté seleccionado, para forzar una
   repoblación real de la cascada.
7. Un cliente sin NRC ni NIT en `/ccf`: debe avisar «No apto para CCF» y rellenar el resto.
8. **Emitir un documento completo de verdad.** Es la única forma de que el backend valide
   nuestros valores; las máscaras son el punto de mayor riesgo.
9. Exportar → borrar los datos de la extensión → importar → volver a rellenar.

## El `formcontrolname` del número de documento en CF

Sigue sin conocerse: el campo no está renderizado en el snapshot. El código lo descubre en
ejecución y guarda el nombre encontrado en `chrome.storage.local`, bajo
`discovered.cfDocNumberControl`. Tras la primera prueba en el portal real, conviene mirarlo
en la consola de la extensión y anotarlo aquí:

```js
chrome.storage.local.get('discovered').then(console.log)
```

| Tipo de documento | `formcontrolname` observado |
| --- | --- |
| `36` NIT | _pendiente_ |
| `13` DUI | _pendiente_ |
| `03` Pasaporte | _pendiente_ |

Para acelerarlo sin esperar a la primera prueba: abrir `/cf`, elegir «NIT» en Tipo
Documento y ejecutar en la consola

```js
copy(document.querySelector('app-facturador-cf tab[heading="Receptor"]').innerHTML)
```

guardando el resultado como un snapshot más.
