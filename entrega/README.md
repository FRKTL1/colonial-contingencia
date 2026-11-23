# Entrega · Caso Colonial Pipeline 2021

Todo lo que pide la actividad está en este repositorio. La tabla dice dónde encontrar cada entregable.

| # | Entregable | Dónde está |
|---|---|---|
| 1 | Ficha del incidente | [`caso/01-ficha-incidente.png`](caso/01-ficha-incidente.png) · cronología y causa raíz en [`caso/`](caso/) |
| 2 | Diagrama de flujo (4 decisiones) | [`caso/02-diagrama-flujo.png`](caso/02-diagrama-flujo.png) · implementado en [`server/src/domain/flow.js`](../server/src/domain/flow.js) |
| 3 | Diseño del sistema (arquitectura, módulos, reglas) | Diapositivas 12–16 de la [presentación](presentacion/Expo-Colonial-Pipeline.pdf) · [README del proyecto](../README.md) |
| 4 | Modelo de base de datos | [`docs/der/`](../docs/der/) (DER conceptual y lógico) · scripts SQL en [`database/`](../database/) |
| 5 | Prototipo funcional | Código en [`client/`](../client/) y [`server/`](../server/); despliegue en Render con [`render.yaml`](../render.yaml) |
| 6 | Tres escenarios probados (inicial, exitoso, fallido) | [`docs/evidencias-pruebas.md`](../docs/evidencias-pruebas.md) · pruebas automáticas en [`server/test/`](../server/test/) |
| 7 | Presentación | [`presentacion/Expo-Colonial-Pipeline.pdf`](presentacion/Expo-Colonial-Pipeline.pdf) (37 diapositivas) · [guion](presentacion/Guion-exposicion.pdf) |
| ★ | Reto adicional: panel de servicios en Figma | [`figma/`](figma/) · especificación en [`docs/panel-figma.md`](../docs/panel-figma.md) · archivo: figma.com/design/MsFkBeMOaDbf6MVfLvwnOV |
| ★ | Mapa de calor de la red real (funciones de Rack · Operación) | Pestaña **Mapa de calor** del sistema · fuentes en [`server/src/domain/sources.js`](../server/src/domain/sources.js) |

## Cómo ejecutarlo

```bash
docker compose up -d                       # PostgreSQL 16
cd server && npm install
cd ../client && npm install && npm run build
cd ../server && npm run db:demo && npm start   # http://localhost:4000
npm test                                       # 73 pruebas
```

Cuentas de demostración, todas con la contraseña `Colonial2021!`: `mtorres@colonial.local` (coordinadora), `jrios@` (TI), `lparedes@` (OT) y `asalinas@` (legal).

## Fuente de la presentación

[`presentacion/fuente/`](presentacion/fuente/) contiene `expo.html` y `guion.html` con sus imágenes. Para regenerar los PDF:

```bash
google-chrome --headless=new --no-pdf-header-footer --virtual-time-budget=6000 \
  --print-to-pdf=Expo-Colonial-Pipeline.pdf expo.html
```
