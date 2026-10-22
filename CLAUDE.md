# Libro de gastos — mapa del proyecto

App web de gastos del hogar. Cada cuenta tiene un solo usuario. Los datos están en Supabase (proyecto "Gastos"), donde cada tabla tiene RLS por `user_id`. La app se publica en Vercel como sitio estático, sin build: lo que está en el repo es lo que se sirve.

## Estructura

```
index.html            solo maquetado: <head>, topbar, tablero, overlay con los sheets, y los <script src>
css/app.css           todos los estilos, agrupados con comentarios de sección
js/*.js               la lógica, repartida por sección (tabla de abajo)
```

Librerías por CDN, cargadas en el `<head>` antes que todo: supabase-js y Chart.js.

## Archivos JS (en orden de carga)

| Orden | Archivo | Qué hace |
|---|---|---|
| 1 | `js/config.js` | URL y clave pública de Supabase; crea el cliente `supa`. |
| 2 | `js/sesion.js` | Login, registro y entrada a la app (`entrarALaApp`). |
| 3 | `js/estado.js` | Estado global `DATA` y constantes (categorías y objetivos por defecto, medios de pago, tipos, horizonte, `CATS_PROYECTABLES`). |
| 4 | `js/utiles.js` | Utilidades: fechas y meses, formato de dinero, sumas, escape de HTML, etiquetas, medios de pago. |
| 5 | `js/datos.js` | Mapeo entre filas de la base y objetos de la app; carga inicial de todo (`cargarTodo`) y barra de estado. |
| 6 | `js/cargas-log.js` | Historial de cargas (tabla `cargas_log`, la llena un trigger en la base): lectura, filtros y render. |
| 7 | `js/proyecciones.js` | Mes seleccionado y proyección de gastos recurrentes; confirmar, guardar, eliminar y omitir recurrentes. |
| 8 | `js/sheets.js` | Abrir y cerrar los paneles (sheets) y navegar entre meses. |
| 9 | `js/filtros.js` | Filtros de la lista, rango visible y la tira de filtros activos. |
| 10 | `js/lista.js` | Render principal: filas de gastos (`filaTx`), acordeón por categoría, `renderTodo` y acciones sobre un gasto. |
| 11 | `js/tablero.js` | Home del mes: "Esperado al cierre" (a pagar a mano, débitos por llegar, variables proyectados), cash requerido y ritmo de variables. |
| 12 | `js/objetivo.js` | Objetivo por subcategoría (`objetivos_subcategoria`): totales, torta del header y pantalla Objetivo mensual (`#objetivo`). |
| 13 | `js/alertas.js` | Alertas de vencimientos de fijos y proyectados sin confirmar. |
| 14 | `js/categorias-helpers.js` | Funciones auxiliares de categorías y subcategorías (búsqueda, `<option>` de selects). |
| 15 | `js/carga-manual.js` | Formulario de carga y edición manual de un gasto. |
| 16 | `js/carga-ia.js` | Carga inteligente: interpretar texto con IA, revisar y guardar; reglas de corrección aprendidas. |
| 17 | `js/recurrentes.js` | Interfaz de gastos recurrentes (lista y editor) y el diálogo de confirmación genérico. |
| 18 | `js/ficha.js` | Ficha de gasto: detalle con promedio de 3 meses y edición campo por campo. |
| 19 | `js/ajustes.js` | Ajustes: ingresos, objetivos (solo "suma al total"; el monto se edita en Objetivo mensual), categorías y backup. |
| 20 | `js/proyectos.js` | Proyectos: vistas, barra de % financiado y detalle de un proyecto. |
| 21 | `js/fuentes.js` | Fuentes de fondos de los proyectos y sus movimientos. |
| 22 | `js/evolucion.js` | Gráfico de evolución mensual (Chart.js). |
| 23 | `js/main.js` | Inicio: `init()` revisa la sesión y entra a la app. |

## Reglas de arquitectura

- **Scripts clásicos, que comparten el ámbito global.** Todos los archivos se cargan con `<script src="...">`, sin `type="module"`. Las funciones y los `let`/`const` de nivel superior de un archivo se ven desde los demás y desde los handlers inline del HTML (`onclick="..."`). No hace falta usar imports ni exports.
- **El orden de carga importa.** Los `<script src>` están al final del `<body>` en el orden de la tabla. El código que corre al cargar (listeners, valores iniciales, `init()`) solo puede usar lo que está definido en ese archivo o en uno anterior. Una función de un archivo posterior se puede llamar únicamente desde código que corre después, como un handler o una función.
- **No usar módulos ES, build, npm, bundlers ni frameworks.**
- **No modificar el esquema de Supabase desde la app.** No se crean ni alteran tablas o columnas; se usan las que existen.
- **Estilos en `css/app.css`.** Ubicá cada estilo nuevo junto a su sección, usando los comentarios de sección que ya están en el archivo.
- Las rutas son relativas y sin barra inicial (`css/app.css`, `js/main.js`), para que funcionen en Vercel, en las previews y al abrir el archivo local.

## Convención para cambios

- Cada cambio va en el archivo de su sección (ver la tabla).
- Si una funcionalidad nueva es grande, va en un archivo nuevo en `js/`. Ese archivo se agrega en el lugar correcto del orden en `index.html` (después de todo lo que usa al cargar) y en la tabla de este `CLAUDE.md`.
