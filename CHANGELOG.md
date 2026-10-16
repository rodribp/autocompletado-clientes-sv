# Registro de cambios

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el versionado es [semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- Base de datos local de clientes con alta, edición, borrado y búsqueda sin acentos.
- Relleno de un clic del receptor en Factura (CF) y Crédito Fiscal (CCF), con la cascada
  departamento → municipio → distrito y el selector de actividad económica.
- «Guardar cliente actual»: lee el receptor que está en pantalla y lo propone como cliente.
- Catálogo de municipios y distritos que se aprende solo de las páginas rellenadas.
- Respaldo e importación en JSON para migrar entre computadoras. La importación abre su
  propia pestaña, enseña qué clientes se agregarían y cuáles se sobrescribirían, y no
  escribe nada hasta que lo confirmas.
- Aviso de aptitud para crédito fiscal por cliente.
- Productos y servicios: pestaña **Productos** en el popup para guardarlos. Se guarda el
  precio final (lo que paga el cliente) y se rellena sin IVA en el crédito fiscal cuando el
  ítem es gravado. El respaldo JSON incluye los productos; un respaldo antiguo, sin productos,
  no borra los que tengas.
- Sugerencias dentro del portal: al escribir en **Producto** o **Código** de la ventana
  «Producto o Servicio» aparecen tus productos guardados; elegir uno rellena la ventana
  (respetando la cantidad escrita) y tú confirmas con «Agregar ítem».
- Sugerencias de clientes en el Receptor: al escribir en **Nombre**, **NIT** (o número de
  documento en la Factura) o **NRC** aparecen tus clientes guardados; elegir uno rellena el
  Receptor. Nunca se activan en el Emisor.
- Comando **Diagnóstico**, para saber qué campos dejó de encontrar la extensión si el
  portal cambia su maquetación.

### Corregido

- Al rellenar otro cliente u otro producto, los campos de texto que el nuevo no tiene se
  vacían en vez de conservar el dato anterior (por ejemplo, el correo del cliente anterior).
- Un cliente sin dirección ya no muestra «falló el campo del que depende» en municipio y
  distrito.
