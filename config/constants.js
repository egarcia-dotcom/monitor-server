/**
 * ================================================================================
 * CONFIGURACIÓN GLOBAL - Monitor Server
 * ================================================================================
 * 
 * Centraliza todas las constantes de configuración del servidor:
 * - Puerto y seguridad
 * - Rutas de carpetas de entrada por cliente
 * - Límites de subida y cola
 * - Extensiones permitidas por cliente
 * 
 * Las variables de entorno pueden sobrescribir valores por defecto:
 * - PORT: puerto HTTP (defecto: 3000)
 * - MONITOR_API_KEY: clave API para endpoints protegidos (defecto: '12345')
 * 
 * ================================================================================
 */

// monitor-server/config/constants.js
const path = require('path');

module.exports = {
    // ================================================================================
    // SERVIDOR
    // ================================================================================
    
    /**
     * Puerto HTTP en el que escucha el servidor
     * - Puede sobrescribirse con variable de entorno PORT
     * - Defecto: 3000
     */
    PORT: process.env.PORT || 3000,
    
    /**
     * Clave API para endpoints protegidos
     * - Puede sobrescribirse con variable de entorno MONITOR_API_KEY
     * - Defecto: '12345' (⚠️ cambiar en producción)
     * - Se valida en middleware de autenticación
     */
    API_KEY: process.env.MONITOR_API_KEY || '12345',
    
    // ================================================================================
    // CARPETAS DE ENTRADA POR CLIENTE
    // ================================================================================
    
    /**
     * Mapeo cliente -> carpeta de entrada
     * 
     * Los archivos se suben aquí y luego se procesan por scripts
     * - airliquide_galicia: PDFs de Air Liquide (planta Galicia)
     * - airliquide_bilbao: PDFs de Air Liquide (planta Bilbao)
     * - airliquide_portugal: TXTs de Air Liquide (gestión pedidos Portugal)
     * - nipongases: PDFs de Nipongases (códigos de barras)
     * 
     * Rutas configuradas en unidad de red H:/ (compartida en servidor)
     */
    BASE_FOLDERS: {
        'airliquide_galicia': 'H:/BASEDATO/PDF_Conversor/entrada/Galicia',
        'airliquide_bilbao': 'H:/BASEDATO/PDF_Conversor/entrada/Bilbao',
        'airliquide_portugal': 'H:/DISTRIBUCIÓN OTROS/AL PORTUGAL/pedidos/pedidos_pt/entrada',
        'nipongases': 'H:/BASEDATO/PDF_Conversor/entrada/NIPONGASES'
    },

    /**
     * Ruta al archivo de mapeo scripts
     * Mapea cliente -> archivo Python/PowerShell a ejecutar
     */
    SCRIPTS_MAP_PATH: path.join(__dirname, 'scripts-map.json'),
    
    /**
     * Directorio temporal para archivos en tránsito
     * Multer los coloca aquí antes de moverlos a su destino
     */
    TEMP_DIR: path.join(__dirname, '../temp'),
    
    // ================================================================================
    // LÍMITES DE SUBIDA Y PROCESAMIENTO
    // ================================================================================
    
    /**
     * Controles de concurrencia y colas de procesamiento
     * 
     * - MAX_CONCURRENT: máximo 1 script ejecutándose a la vez
     *   (evita saturation de CPU/IO en el servidor)
     * - MAX_FILES: máximo 10 archivos por request de subida
     * - MAX_FILE_SIZE: límite de 10MB por archivo
     * - MAX_QUEUE_SIZE: máximo 20 trabajos en espera (FIFO)
     *
     * Si la cola está llena (>= MAX_QUEUE_SIZE), se rechaza el job
     */
    UPLOAD_LIMITS: {
        MAX_CONCURRENT: 1,               // Solo 1 script a la vez (evita sobrecarga)
        MAX_FILES: 10,                   // Máximo 10 archivos a la vez
        MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB por archivo
        MAX_QUEUE_SIZE: 20               // Máximo 20 en espera
    },

    // ================================================================================
    // EXTENSIONES PERMITIDAS POR CLIENTE
    // ================================================================================
    
    /**
     * Define qué tipos de archivo cada cliente puede subir
     * 
     * - airliquide_galicia/bilbao: solo PDFs (recorte por códigos de barras)
     * - airliquide_portugal: solo TXTs (conversión a Excel)
     * - nipongases: solo PDFs (recorte por códigos de barras)
     * 
     * Los archivos con extensión no permitida se rechazan inmediatamente
     */
    ALLOWED_EXTENSIONS: {
        'airliquide_galicia': ['.pdf'],
        'airliquide_bilbao': ['.pdf'],
        'airliquide_portugal': ['.txt'],  // ⚠️ Portugal solo TXT
        'nipongases': ['.pdf']
    }
};

/**
 * ================================================================================
 * EJEMPLO: CÓMO AÑADIR UN NUEVO CLIENTE
 * ================================================================================
 * 
 * Sigue estos pasos para integrar un nuevo cliente en el sistema:
 * 
 * Paso 1: Crear carpeta de entrada
 * ────────────────────────────────
 * Crea la carpeta en H:/ (red compartida):
 *   H:/BASEDATO/PDF_Conversor/entrada/NUEVO_CLIENTE
 * 
 * Paso 2: Añadir entrada en BASE_FOLDERS
 * ────────────────────────────────────────
 * BASE_FOLDERS: {
 *     // ... existentes ...
 *     'nuevo_cliente': 'H:/BASEDATO/PDF_Conversor/entrada/NUEVO_CLIENTE'
 * }
 * 
 * Paso 3: Crear script Python o PowerShell
 * ───────────────────────────────────────
 * Ejemplo: monitor-server/scripts/nuevo_cliente/procesar.py
 * 
 * El script debe soportar dos modos:
 *   - API: python procesar.py <folder> <filename> <metadata>
 *   - Batch: python procesar.py --watch
 * 
 * Paso 4: Registrar script en scripts-map.json
 * ──────────────────────────────────────────
 * {
 *     "nuevo_cliente": "scripts/nuevo_cliente/procesar.py"
 * }
 * 
 * Paso 5: Añadir extensiones permitidas
 * ──────────────────────────────────────
 * ALLOWED_EXTENSIONS: {
 *     // ... existentes ...
 *     'nuevo_cliente': ['.pdf', '.txt']  // Permitir ambos si necesario
 * }
 * 
 * Paso 6: (Opcional) Añadir timeout en executor.js
 * ────────────────────────────────────────────────
 * Si el script tarda más de 3 minutos, aumenta el timeout en:
 *   monitor-server/utils/executor.js -> TIMEOUTS
 * 
 * Paso 7: Crear requirements.txt (si es Python)
 * ──────────────────────────────────────────────
 * Documenta dependencias en:
 *   monitor-server/scripts/nuevo_cliente/requirements.txt
 * 
 * Instalación en producción:
 *   python -m pip install -r scripts/nuevo_cliente/requirements.txt
 * 
 * ================================================================================
 */

/*
// EJEMPLO ANTIGUO (comentado)
// 
// BASE_FOLDERS: {
//     // ... existentes ...
//     'nuevo_cliente': 'H:/BASEDATO/PDF_Conversor/entrada/NUEVO_CLIENTE'
// }
//
// ALLOWED_EXTENSIONS: {
//     // ... existentes ...
//     'nuevo_cliente': ['.pdf', '.txt']  // Permitir ambos
// }
*/