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
- Respaldo e importación en JSON para migrar entre computadoras.
- Aviso de aptitud para crédito fiscal por cliente.
- Comando **Diagnóstico**, para saber qué campos dejó de encontrar la extensión si el
  portal cambia su maquetación.
