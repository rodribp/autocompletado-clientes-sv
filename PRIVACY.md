# Política de privacidad

**Autocompletado de clientes — factura.gob.sv**

## Resumen

La extensión no recoge, transmite ni comparte ningún dato. Todo se queda en tu navegador.

## Qué se guarda

La información fiscal de los clientes que tú mismo introduces o capturas: nombre, nombre
comercial, tipo y número de documento (NIT, DUI, pasaporte, carnet de residente u otro),
NRC, actividad económica, dirección, correo, teléfono y notas.

Además, la extensión aprende y guarda los códigos y nombres de municipios y distritos que
el portal muestra, para poder ofrecerte desplegables al dar de alta un cliente.

## Dónde se guarda

En `chrome.storage.local`, es decir, en el perfil de Chrome de tu computadora.

No se usa `chrome.storage.sync`, así que los datos **no** se sincronizan con tu cuenta de
Google ni se copian a servidores de terceros.

## Qué se envía a internet

Nada. La extensión no hace ninguna petición de red. No incluye analítica, telemetría,
informes de errores ni recursos externos.

## Permisos y por qué

| Permiso | Para qué |
| --- | --- |
| `storage` | Guardar tus clientes en el disco local. |
| `scripting` | Volver a inyectar el script en una pestaña que ya estaba abierta cuando instalaste o actualizaste la extensión. |
| `host_permissions: https://admin.factura.gob.sv/*` | Leer y rellenar el formulario del receptor. Es el único sitio donde la extensión puede actuar. |

## Cómo borrar tus datos

Desinstalar la extensión borra todo lo que guardó. Antes, si quieres conservarlo, usa
**Exportar respaldo (JSON)** desde el menú `⋯`.

## Contacto

Los problemas y dudas se atienden en las *issues* del repositorio.
