### 3.1 Visión general
```
┌─────────────────┐
│ Power Automate  │ (Recibe emails con adjuntos)
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────────────────────────┐
│  Carpetas de Red (H:\ y \\192.168.1.40\dwcloud\)    │
│  ├─ Entrada/    (PDFs/TXTs pendientes)              │
│  ├─ Procesados/ (Archivos ya procesados)            │
│  └─ Errores/    (Archivos con fallos)               │
└────────┬────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────┐
│    Monitor Server (Node.js - Puerto 3000)           │
│  ┌──────────────────────────────────────────────┐   │
│  │  API REST                                    │   │
│  │  ├─ POST /api/upload  (upload manual)        │   │
│  │  ├─ POST /api/scan-folders (escanear)        │   │
│  │  ├─ POST /api/process-folder (procesar)      │   │
│  │  ├─ GET  /api/history (historial)            │   │
│  │  └─ POST /run (Power Automate)               │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │  Sistema de Colas (executor.js)              │   │
│  │  • Máximo 1 script ejecutándose              │   │
│  │  • Hasta 20 en cola de espera                │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │  Sistema de Logs (Winston)                   │   │
│  │  • Rotación diaria                           │   │
│  │  • logs/monitor-YYYY-MM-DD.log               │   │
│  └──────────────────────────────────────────────┘   │
└────────┬────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────┐
│  Scripts Python (Procesamiento)                     │
│  ├─ airliquide.py (Galicia/Bilbao)                  │
│  ├─ airliquide_portugal.py (Portugal)               │
│  └─ nipongases.py (Nipongases)                      │
└────────┬────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────┐
│  Carpetas de Salida (\\192.168.1.40\dwcloud\)       │
│  ├─ AIRLIQUIDE/      (PDFs recortados Galicia)      │
│  ├─ AIRLIQUIDEBILBAO/ (PDFs recortados Bilbao)      │
│  ├─ pedidos_pt/salida/ (Excel Portugal)             │
│  └─ NIPONGASES/      (PDFs recortados Nipongases)   │
└─────────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────┐
│    Equipos Operativos (Distribución)                │
└─────────────────────────────────────────────────────┘
```

### 3.2 Flujo de datos detallado

#### Flujo A: Upload Manual
```
1. Usuario accede a http://hojasderuta.babeycia.es
2. Selecciona cliente en dropdown
3. Arrastra/selecciona archivo(s)
4. Click en "PROCESAR ARCHIVOS"
   ↓
5. Frontend valida:
   - Extensión correcta (.pdf o .txt según cliente)
   - Tamaño < 10MB
   - Máximo 10 archivos
   - No duplicados en cola
   ↓
6. POST /api/upload con multipart/form-data
   ↓
7. Backend (upload.controller.js):
   - Guarda en temp/ con multer
   - Valida duplicados en carpeta destino
   - Copia a carpeta de entrada (H:\...)
   - Elimina de temp/
   ↓
8. executor.js añade job a cola
   ↓
9. Ejecuta script Python correspondiente:
   python scripts/[cliente]/[script].py [folder] [filename] {}
   ↓
10. Script procesa archivo:
    - Lee de carpeta entrada
    - Procesa según lógica del cliente
    - Guarda resultado en carpeta salida
    - Mueve original a procesados/ o errores/
    ↓
11. executor.js registra resultado en history.json
    ↓
12. Frontend muestra toast de éxito/error
```

#### Flujo B: Escaneo de Carpetas
```
1. Usuario click en "🔍 REVISAR TODAS LAS CARPETAS"
   ↓
2. POST /api/scan-folders
   ↓
3. folder.controller.js:
   - Lee contenido de cada carpeta de entrada
   - Filtra por extensión permitida
   - Retorna array de archivos por cliente
   ↓
4. Frontend muestra resultados:
   ┌────────────────────────────────────┐
   │ Air Liquide Galicia: 3 archivos    │
   │ [PROCESAR CARPETA]                 │
   ├────────────────────────────────────┤
   │ Air Liquide Portugal: 5 archivos   │
   │ [PROCESAR CARPETA]                 │
   └────────────────────────────────────┘
   ↓
5. Usuario click en "PROCESAR CARPETA"
   ↓
6. POST /api/process-folder { client: "airliquide_galicia" }
   ↓
7. executor.js ejecuta:
   python scripts/[cliente]/[script].py --watch
   ↓
8. Script procesa TODOS los archivos de la carpeta
   ↓
9. Resultados visibles en tiempo real (stdout)
```

#### Flujo C: Power Automate (Automático)
```
1. Email llega con adjunto PDF/TXT
   ↓
2. Power Automate:
   - Descarga adjunto
   - Identifica cliente por remitente
   - Copia a carpeta H:\...\entrada\[Cliente]\
   ↓
3. (Opcional) POST /run con API key
   Body: { "client": "airliquide_galicia", "filename": "pedido.pdf" }
   ↓
4. automation.routes.js valida API key
   ↓
5. executor.js procesa igual que upload manual
```

### 3.3 Componentes del sistema
┌─────────────────────┐──────────────────────────┐────────────────────────────────────────┐
|     Componente      |       Tecnología         |          Responsabilidad               |
|---------------------|--------------------------|----------------------------------------|
| **Monitor Server**  | Node.js + Express        | API REST, gestión de colas, logging    |
| **Frontend**        | Vanilla JS + CSS         | Interfaz de usuario, upload, historial |
| **Scripts Python**  | Python 3.9+              | Procesamiento de documentos            |
| **Power Automate**  | Microsoft Power Automate | Automatización de emails               |
| **Carpetas de Red** | Windows File Share       | Almacenamiento compartido              |
| **Winston**         | Node.js logger           | Logging con rotación diaria            |
| **history.json**    | JSON file                | Base de datos simple (30 días)         |
└─────────────────────└──────────────────────────└────────────────────────────────────────┘


monitor-server/
├── server.js                    # ⭐ Punto de entrada (20 líneas)
├── package.json                 # Dependencias y scripts
├── config/
│   ├── constants.js             # ⭐ Configuración global
│   └── scripts-map.json         # Mapeo cliente → script
├── routes/
│   ├── index.js                 # Router principal
│   ├── web.routes.js            # Endpoints API web (/api/*)
│   └── automation.routes.js     # Endpoint Power Automate (/run)
├── controllers/
│   ├── upload.controller.js     # ⭐ Lógica de uploads
│   ├── folder.controller.js     # ⭐ Escaneo de carpetas
│   └── history.controller.js    # Consulta de historial
├── middlewares/
│   ├── auth.middleware.js       # Validación API key
│   └── error.middleware.js      # Manejo de errores centralizado
├── utils/
│   ├── executor.js              # ⭐ Cola y ejecución de scripts
│   ├── logger.js                # Winston configurado
│   └── history.js               # Operaciones sobre history.json
├── public/                      # Frontend estático
│   ├── index.html
│   ├── css/ (3 archivos)
│   └── js/ (6 archivos)
├── scripts/                     # Scripts Python
│   ├── airliquide/
│   └── nipongases/
├── data/
│   └── history.json             # Historial de procesamientos
├── temp/                        # Uploads temporales (se auto-limpia)
└── logs/                        # Logs del servidor
    └── monitor-YYYY-MM-DD.log#   m o n i t o r - s e r v e r  
 