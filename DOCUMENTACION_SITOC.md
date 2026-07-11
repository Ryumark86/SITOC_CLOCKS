# SITOC Clock In - Documentacion Tecnica

## 1. Descripcion General

SITOC Clock In es una aplicacion web (SPA) para el registro diario de personal operativo de telecomunicaciones. Permite a los tecnicos reportar su estado, ubicacion GPS, y evidencia fotografica, enviando los datos de forma automatica a un grupo de Telegram y a un Google Sheet maestro.

### Caracteristicas principales
- Formulario responsive (mobile-first) optimizado para celulares
- Captura automatica de GPS con precision alta
- Fotos con marca de agua automatica (tecnico, fecha, sitio, coordenadas)
- Generacion de archivos .zip con reporte (.json + .xlsx + foto)
- Envio a Telegram (mensaje + JSON + Excel)
- Registro en Google Sheet maestro
- Funcionamiento offline con cola de reintentos
- Seguridad mediante proxy en Google Apps Script

---

## 2. Arquitectura

### Diagrama de flujo

```
┌─────────────────────────────────────────────────┐
│              NAVEGADOR (Frontend)                │
│                                                  │
│  index.html  ──>  app.js  ──>  styles.css        │
│                                                  │
│  ┌──────────────┐    ┌──────────────────────┐    │
│  │  Formulario   │    │   LocalStorage        │    │
│  │  - Nombre     │    │   - Historial         │    │
│  │  - Cedula     │    │   - Cola pendientes   │    │
│  │  - Cargo      │    └──────────────────────┘    │
│  │  - Fecha      │                                │
│  │  - Estado     │    ┌──────────────────────┐    │
│  │  - Proyecto   │    │   Canvas 2D           │    │
│  │  - Estacion   │    │   Marca de agua       │    │
│  │  - GPS        │    └──────────────────────┘    │
│  │  - Foto       │                                │
│  └──────────────┘    ┌──────────────────────┐    │
│                       │   JSZip + SheetJS     │    │
│                       │   Generar .zip/.xlsx  │    │
│                       └──────────────────────┘    │
│                                    │              │
│                          sendToProxy()            │
└────────────────────────────┬──────────────────────┘
                             │
                     POST JSON con datos
                     (photoBase64 + xlsxBase64)
                             │
                             ▼
┌────────────────────────────────────────────────────┐
│          GOOGLE APPS SCRIPT (Proxy/Backend)        │
│                                                     │
│  doPost() ──> Valida APP_SECRET                    │
│       │                                             │
│       ├──> writeSheet() ──> Google Sheets API       │
│       │                          │                  │
│       │                          ▼                  │
│       │                   Google Sheet              │
│       │                   (fila nueva)              │
│       │                                             │
│       └──> sendTelegramAll() ──> Telegram Bot API   │
│                                    │                │
│                                    ▼                │
│                             Grupo Telegram          │
│                             - Mensaje con foto      │
│                             - Archivo .json         │
│                             - Archivo .xlsx         │
└────────────────────────────────────────────────────┘
```

### Stack tecnologico

| Componente | Tecnologia | Funcion |
|-----------|-----------|---------|
| Frontend | HTML5 + CSS3 + Vanilla JS | Interfaz de usuario |
| Compresion | JSZip 3.10.1 | Generar archivos .zip |
| Excel | SheetJS / XLSX 0.20.1 | Generar archivos .xlsx |
| Persistencia | localStorage | Historial y cola offline |
| Backend | Google Apps Script | Proxy seguro |
| Base de datos | Google Sheets | Registro maestro |
| Mensajeria | Telegram Bot API | Notificaciones |
| Deploy | GitHub Pages | Hosting estatico |

---

## 3. Archivos del Proyecto

```
SITOC_CLOCKS/
├── index.html              # Formulario principal (126 lineas)
├── styles.css              # Estilos CSS responsive (437 lineas)
├── app.js                  # Logica completa del frontend (766 lineas)
├── google-apps-script.gs   # Codigo del proxy backend (147 lineas)
├── logo-sitoc.png          # Logo SITOC
├── jszip.min.js            # Fallback local de JSZip
├── xlsx.full.min.js        # Fallback local de SheetJS
├── .gitignore              # Archivos excluidos del repositorio
├── Agent.md                # Contexto para agentes de IA
├── DOCUMENTACION_SITOC.md  # Este documento
└── .github/
    └── workflows/
        └── deploy.yml      # Deploy automatico a GitHub Pages
```

---

## 4. Seguridad (Blindaje)

### Problema original
Las credenciales de Telegram y Google Sheets estaban hardcodeadas en app.js, visibles para cualquier usuario desde las DevTools del navegador.

### Solucion implementada: Proxy en Google Apps Script

```
ANTES (inseguro):
  app.js ──> Telegram API (token visible)
  app.js ──> Google Sheets (token visible)

DESPUES (seguro):
  app.js ──> Google Apps Script (proxy)
                ├── Google Sheets (token oculto en servidor)
                └── Telegram API (token oculto en servidor)
```

### Credenciales protegidas

| Credencial | Ubicacion actual | Antes |
|-----------|-----------------|-------|
| Telegram Bot Token | Script Properties (Apps Script) | app.js linea 5 |
| Telegram Chat ID | Script Properties (Apps Script) | app.js linea 6 |
| Google Sheets Token | Script Properties (Apps Script) | app.js linea 10 |
| APP_SECRET | Script Properties + app.js | No existia |
| SPREADSHEET_ID | Script Properties (Apps Script) | app.js linea 9 |

### Variables de Script Properties

| Variable | Valor | Descripcion |
|----------|-------|-------------|
| TELEGRAM_BOT_TOKEN | 8840403500:AAEq... | Token del bot de Telegram |
| TELEGRAM_CHAT_ID | -5327203234 | ID del grupo de Telegram |
| APP_SECRET | sitoc_2026_blindaje | Token secreto de autenticacion |
| SPREADSHEET_ID | 1gdxPF7h7DZx8SX... | ID del Google Sheet |

### Flujo de autenticacion

1. Frontend envia POST al proxy con `{ secret: APP_SECRET, action, data }`
2. Apps Script verifica que `body.secret === props.getProperty('APP_SECRET')`
3. Si no coincide, retorna `{ ok: false, error: 'Unauthorized' }`
4. Si coincide, procesa la accion y retorna resultado

---

## 5. Formulario (index.html)

### Campos del formulario

| # | Campo | Tipo | ID | Requerido | Notas |
|---|-------|------|----|-----------|-------|
| 1 | Nombre del Tecnico | text | nombre | Si | autocomplete="name" |
| 2 | Numero de Cedula | text | cedula | Si | inputmode="numeric" |
| 3 | Cargo | select | cargo | Si | 4 opciones |
| 4 | Fecha y Hora | datetime-local | fecha | Si | readonly, auto cada 60s |
| 5 | Estado | select | estado | Si | 9 opciones |
| 6 | Proyecto | text | proyecto | Si | Campo nuevo |
| 7 | Estacion / Lugar | text | estacion | Si | |
| 8 | GPS | status bar | gpsStatus | No | Automatico |
| 9 | Fin de Ausencia | date | finAusencia | Condicional | Solo 3 estados |
| 10 | Motivo | textarea | motivo | Condicional | Solo 2 estados |
| 11 | Foto | file input | foto | No | Camara o galeria |

### Estados y campos condicionales

| Estado | Fin Ausencia | Motivo Stand By |
|--------|-------------|-----------------|
| De permiso | Requerido | - |
| En Ruta | - | - |
| Enfermo | - | - |
| Incapacitado | Requerido | - |
| Laborando | - | - |
| Sin asignacion | - | - |
| Sin permisos de ingreso | - | Requerido |
| Stand By | - | Requerido |
| Vacaciones | Requerido | - |

---

## 6. Logica del Frontend (app.js)

### Estructura general
- Todo el codigo esta encapsulado en una IIFE (Immediately Invoked Function Expression)
- Usa `var` en lugar de `let/const` (compatibilidad ES5)
- Funciones asincronas con `async/await`
- Event listeners con `addEventListener`

### Flujo principal al enviar formulario

```
1.  getPosition()              ──> Obtiene coordenadas GPS
2.  buildReportData()          ──> Construye objeto con todos los datos
3.  validate(data)             ──> Valida campos requeridos
4.  drawWatermark()            ──> Dibuja marca de agua en la foto (canvas)
5.  generateExcelArray()       ──> Genera array para SheetJS
6.  generateZip()              ──> Empaqueta .json + .xlsx + foto en .zip
7.  downloadBlob()             ──> Descarga .zip al dispositivo
8.  addToHistory()             ──> Guarda en localStorage
9.  blobToBase64()             ──> Convierte foto a base64
10. xlsxToBase64()             ──> Convierte Excel a base64
11. sendToProxy('sendAll')     ──> Envia todo al Google Apps Script
12. Si falla: addToPending()   ──> Guarda en cola de reintentos
13. resetForm()                ──> Limpia el formulario
```

### Funciones clave

| Funcion | Linea | Proposito |
|---------|-------|-----------|
| sendToProxy | 9 | Envia datos al backend seguro |
| getPosition | 311 | Obtener coordenadas GPS |
| buildReportData | 377 | Construir objeto de datos |
| validate | 401 | Validar formulario |
| buildTextMessage | 423 | Formatear mensaje para Telegram |
| drawWatermark | 450 | Marca de agua via Canvas |
| generateExcelArray | 506 | Generar .xlsx en memoria |
| generateZip | 533 | Empaquetar archivos en .zip |
| procesarColaPendiente | 170 | Reintentar envios fallidos |
| renderPendingList | 221 | Mostrar cola de pendientes |

### Marca de agua (drawWatermark)

1. Crea un canvas del mismo tamano que la foto
2. Dibuja la foto original
3. Calcula tamano de fuente proporcionado (3.5% del ancho)
4. dibuja un rectangulo semitransparente negro (rgba 0,0,0,0.65)
5. Escribe en texto blanco:
   - Tecnico: [nombre]
   - Fecha: [fecha]
   - Sitio: [estacion]
   - GPS: [lat], [lng]
6. Exporta como JPEG calidad 0.92

---

## 7. Backend (Google Apps Script)

### Archivo: google-apps-script.gs (147 lineas)

### Funciones

| Funcion | Linea | Proposito |
|---------|-------|-----------|
| doPost | 1 | Punto de entrada, valida secret, enruta acciones |
| writeSheet | 31 | Escribe fila en Google Sheet |
| sendTelegramAll | 50 | Envia mensaje + JSON + XLSX a Telegram |
| buildTelegramText | 106 | Formatea mensaje Markdown |
| tgApi | 133 | Helper para Telegram Bot API |
| jsonResponse | 144 | Retorna respuesta JSON |

### Acciones soportadas

| action | Descripcion | Endpoint |
|--------|-------------|----------|
| sendAll | Escribe en Sheet + envia a Telegram | POST |
| sendToSheet | Solo escribe en Sheet | POST |
| sendToTelegram | Solo envia a Telegram | POST |

### Estructura de la peticion

```json
{
  "secret": "sitoc_2026_blindaje",
  "action": "sendAll",
  "data": {
    "nombreTecnico": "Juan Perez",
    "cedula": "8-123-4567",
    "cargo": "Tecnico",
    "fechaReporte": "2026-07-10T14:30",
    "estado": "Laborando",
    "proyecto": "Torre Norte",
    "estacion": "Estacion Central",
    "lat": "9.032456",
    "lng": "-79.521340",
    "finAusencia": "",
    "motivoStandBy": "",
    "photoBase64": "...(base64 de la foto)...",
    "xlsxBase64": "...(base64 del Excel)..."
  }
}
```

### Estructura de la respuesta

```json
{
  "ok": true,
  "result": {
    "sheet": { "ok": true },
    "telegram": {
      "message": true,
      "json": true,
      "xlsx": true
    }
  }
}
```

### Columnas del Google Sheet

| Col | Encabezado | Tipo |
|-----|-----------|------|
| A | Nombre del Tecnico | Texto |
| B | Cedula | Texto |
| C | Cargo | Texto |
| D | Fecha del Reporte | Texto |
| E | Estado | Texto |
| F | Proyecto | Texto |
| G | Estacion / Lugar | Texto |
| H | Latitud | Texto |
| I | Longitud | Texto |
| J | Fin de Ausencia | Texto |
| K | Motivo Stand By | Texto |

### Mensaje de Telegram

```
*REPORTE SITOC*

*Tecnico:* Juan Perez
*Cedula:* 8-123-4567
*Cargo:* Tecnico
*Fecha:* 2026-07-10 14:30
*Estado:* Laborando
*Proyecto:* Torre Norte
*Sitio:* Estacion Central
*Ubicacion:* 9.032456, -79.521340
https://www.google.com/maps?q=9.032456,-79.521340

_Generado por SITOC Clock In_
```

---

## 8. Cola Offline

### Como funciona

1. Si el envio al proxy falla, el reporte se guarda en `localStorage` con key `sitoc_pending`
2. Cuando el navegador detecta conexion (`online` event), reenvia automaticamente
3. Tambien reintenta al cargar la pagina si hay pendientes

### Estructura de una entrada pendiente

```json
{
  "data": { ...datos del reporte... },
  "photoBase64": "...(foto en base64)...",
  "xlsxBase64": "...(Excel en base64)...",
  "timestamp": "2026-07-10T14:30:00.000Z",
  "sentOk": false,
  "retries": 0
}
```

### Limites

- Almacenamiento: 5-10MB dependiendo del navegador
- Si se llena: alerta al usuario para sincronizar pendientes
- Delay entre reintentos: 1 segundo
- Las entradas se eliminan automaticamente al enviarse exitosamente

---

## 9. Deploy y CI/CD

### GitHub Actions (.github/workflows/deploy.yml)

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
```

- Se ejecuta automaticamente al hacer push a la rama `main`
- Sube todos los archivos a GitHub Pages
- La app queda disponible en: `https://ryumark86.github.io/SITOC_CLOCKS/`

---

## 10. Configuracion del Google Apps Script

### Pasos para configurar

1. Ir a https://script.google.com
2. Abrir el proyecto "SITOC-Proxy"
3. Pegar el codigo de `google-apps-script.gs`
4. Ir a: Proyecto > Configuracion del proyecto > Propiedades
5. Agregar las 4 propiedades (ver tabla en seccion 4)
6. Implementar > Nueva implementacion > App web
   - Ejecutar como: Yo
   - Quien tiene acceso: Cualquier persona
7. Copiar la URL generada
8. Pegar la URL en `app.js` linea 5: `var PROXY_URL = '...'`

---

## 11. Mantenimiento

### Para cambiar el bot de Telegram
1. Crear nuevo bot via @BotFather
2. Actualizar `TELEGRAM_BOT_TOKEN` en Script Properties
3. Actualizar `TELEGRAM_CHAT_ID` en Script Properties

### Para cambiar el Google Sheet
1. Crear nuevo sheet en Google Sheets
2. Pegar encabezados en fila 1 (ver seccion 7)
3. Actualizar `SPREADSHEET_ID` en Script Properties

### Para agregar un nuevo estado
1. Agregar `<option>` en `index.html`
2. Actualizar `toggleConditionalFields()` en `app.js` si tiene campos condicionales
3. Actualizar `buildTextMessage()` en `google-apps-script.gs` si afecta el mensaje

---

## 12. Credenciales y Seguridad

### Cuentas involucradas

| Servicio | Cuenta | Uso |
|----------|--------|-----|
| GitHub | Ryumark86 | Repositorio y deploy |
| Google | (cuenta nueva) | Apps Script + Sheets |
| Telegram | Bot via @BotFather | Notificaciones |

### Archivos que contienen credenciales

| Archivo | Credencial | Visible en navegador |
|---------|-----------|---------------------|
| app.js | APP_SECRET | Si (necesario para autenticar) |
| app.js | PROXY_URL | Si (URL publica) |
| Script Properties | TELEGRAM_BOT_TOKEN | No (servidor) |
| Script Properties | TELEGRAM_CHAT_ID | No (servidor) |
| Script Properties | SPREADSHEET_ID | No (servidor) |

### Nota sobre APP_SECRET
El `APP_SECRET` esta visible en el JavaScript del navegador. Sin embargo, solo se usa para autenticar peticiones al proxy. Un atacante podria verlo y usarlo para enviar datos falsos al Sheet/Telegram, pero:
1. No puede robar credenciales de Telegram (estan en el servidor)
2. No puede acceder a otros datos del Sheet
3. Se puede mitigar agregando rate limiting o validacion de IP en el futuro
