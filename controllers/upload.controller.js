/**
 * ================================================================================
 * CONTROLADOR DE SUBIDA - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Recibir archivos cargados por usuarios (upload manual)
 * - Validar extensiones y duplicados
 * - Mover archivos a carpetas de entrada del cliente
 * - Encolar procesamiento inmediato del archivo
 * - Registrar resultado en historial
 * 
 * Flujo de subida:
 * 1. Multer recibe archivos en carpeta temporal (TEMP_DIR)
 * 2. Validar cliente, extensiones, duplicados
 * 3. Mover archivo a carpeta de entrada del cliente (BASE_FOLDERS)
 * 4. Encolar job para procesar con script correspondiente (API mode)
 * 5. Registrar entrada en historial (éxito o error)
 * 
 * Diferencia con batch:
 * - UPLOAD (manual): procesa 1 archivo recibido por HTTP
 * - BATCH (--watch): procesa todos los archivos de una carpeta
 * 
 * ================================================================================
 */

// monitor-server/controllers/upload.controller.js
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const { runScript, enqueue } = require('../utils/executor');
const logger = require('../utils/logger');
const history = require('../utils/history');
const { BASE_FOLDERS, UPLOAD_LIMITS, ALLOWED_EXTENSIONS, TEMP_DIR } = require('../config/constants');

const SCRIPTS_MAP = require('../config/scripts-map.json');

/**
 * Configuración de multer para recepción de archivos
 * 
 * - destination: carpeta temporal donde se guardan inicialmente
 * - filename: genera nombre único con UUID + nombre original
 *   (ej: "550e8400-e29b-41d4-a716-446655440000-ALBERTO.pdf")
 * 
 * Límites:
 * - Tamaño máximo: 10MB por archivo (MAX_FILE_SIZE)
 * - Máximo 10 archivos por request (MAX_FILES)
 * - Solo PDF o TXT permitidos
 */
const storage = multer.diskStorage({
    destination: TEMP_DIR,          
    filename: (req, file, cb) => {
        // Nombra archivo: UUID-nombreOriginal (evita conflictos)
        cb(null, `${uuidv4()}-${file.originalname}`);
    }
});

/**
 * Middleware multer configurado
 * 
 * - Almacena en TEMP_DIR
 * - Limita tamaño a MAX_FILE_SIZE
 * - Filtra solo .pdf y .txt
 * - Máximo MAX_FILES archivos por request
 */
const upload = multer({
    storage,
    limits: { fileSize: UPLOAD_LIMITS.MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        // Primera validación: .pdf o .txt (ajustada después por cliente)
        if (ext === '.pdf' || ext === '.txt') {
            cb(null, true);
        } else {
            cb(new Error('Solo PDF o TXT permitidos'));
        }
    }
}).array('files', UPLOAD_LIMITS.MAX_FILES);     

/**
 * Procesa archivos cargados manualmente (upload)
 * 
 * Endpoint: POST /api/upload
 * Content-Type: multipart/form-data
 * 
 * Body:
 * - client: cliente al que pertenecen los archivos (obligatorio)
 * - files: 1 a 10 archivos PDF o TXT (obligatorio)
 * 
 * Response exitosa:
 * {
 *   "results": [
 *     { "filename": "ALBERTO.pdf", "status": "queued", "message": "En cola" },
 *     { "filename": "INVALIDO.doc", "status": "error", "message": "Solo se permiten archivos .pdf, .txt" }
 *   ]
 * }
 * 
 * Estados posibles por archivo:
 * - "queued": encolado para procesamiento (éxito)
 * - "queue_full": no se pudo encolar (cola llena)
 * - "error": validación fallida (extensión, duplicado, etc.)
 * 
 * Flujo por archivo:
 * 1. Validar cliente existe
 * 2. Validar extensión según cliente (ALLOWED_EXTENSIONS)
 * 3. Validar no es duplicado
 * 4. Mover archivo a carpeta cliente (BASE_FOLDERS)
 * 5. Encolar job para procesar con script (modo API: client, filename, metadata)
 * 6. Registrar en historial después del procesamiento
 */
async function processUpload(req, res) {
    try {
        const { client } = req.body;
        
        // ────────────────────────────────────────────────────────────────
        // VALIDACIÓN 1: Cliente existe en SCRIPTS_MAP
        // ────────────────────────────────────────────────────────────────
        if (!client || !SCRIPTS_MAP[client]) {
            return res.status(400).json({ error: 'Cliente inválido' });
        }

        const files = req.files;
        
        // ────────────────────────────────────────────────────────────────
        // VALIDACIÓN 2: Se recibieron archivos
        // ────────────────────────────────────────────────────────────────
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No se recibieron archivos' });
        }

        // ────────────────────────────────────────────────────────────────
        // PREPARACIÓN: Obtener carpeta destino y script
        // ────────────────────────────────────────────────────────────────
        const targetFolder = BASE_FOLDERS[client];
        if (!fs.existsSync(targetFolder)) {
            fs.mkdirSync(targetFolder, { recursive: true });
        }

        const results = [];
        const scriptPath = SCRIPTS_MAP[client];
        
        // Resolver ruta absoluta del script (relativa a monitor-server/)
        const absoluteScriptPath = path.isAbsolute(scriptPath) 
            ? scriptPath 
            : path.join(__dirname, '../', scriptPath);

        // ────────────────────────────────────────────────────────────────
        // PROCESAR CADA ARCHIVO
        // ────────────────────────────────────────────────────────────────
        for (const file of files) {
            const filename = file.originalname;
            const targetPath = path.join(targetFolder, filename);

            // ────────────────────────────────────────────────────────────
            // VALIDACIÓN 3: Extensión permitida para este cliente
            // ────────────────────────────────────────────────────────────
            const ext = path.extname(filename).toLowerCase();
            const allowedExts = ALLOWED_EXTENSIONS[client] || ALLOWED_EXTENSIONS.default;
            
            if (!allowedExts.includes(ext)) {
                // Limpiar archivo temporal
                fs.unlinkSync(file.path);
                results.push({ 
                    filename, 
                    status: 'error', 
                    message: `Solo se permiten archivos ${allowedExts.join(', ')}` 
                });
                continue;
            }

            // ────────────────────────────────────────────────────────────
            // VALIDACIÓN 4: No es duplicado
            // ────────────────────────────────────────────────────────────
            if (fs.existsSync(targetPath)) {
                fs.unlinkSync(file.path);
                results.push({ filename, status: 'error', message: 'Archivo ya existe' });
                continue;
            }

            // ────────────────────────────────────────────────────────────
            // PASO 1: Mover archivo a carpeta del cliente
            // ────────────────────────────────────────────────────────────
            // Usa fs-extra.move() que maneja cross-device moves automáticamente
            await fs.move(file.path, targetPath, { overwrite: false });

            // ────────────────────────────────────────────────────────────
            // PASO 2: Encolar procesamiento
            // ────────────────────────────────────────────────────────────
            const jobId = uuidv4();
            logger.info(`Job ${jobId}: subida manual - ${filename} (${client})`);

            const enqueued = enqueue(async () => {
                try {
                    // Pasar args en modo API: client, filename, metadata
                    const args = [client, filename, JSON.stringify({ source: 'manual' })];
                    const result = await runScript(absoluteScriptPath, args, jobId);
                    
                    const success = result.exitCode === 0;
                    
                    // ────────────────────────────────────────────────────
                    // PASO 3: Registrar en historial
                    // ────────────────────────────────────────────────────
                    await history.addEntry({
                        filename,
                        cliente: client,
                        status: success ? 'success' : 'error',
                        errorMessage: success ? null : 'Error en script',
                        errorDetail: success ? null : result.stderr,
                        processedBy: 'manual'
                    });
                    
                    logger.info(`Job ${jobId}: completado - ${success ? 'éxito' : 'error'}`);
                } catch (err) {
                    // Registrar excepciones en historial
                    await history.addEntry({
                        filename,
                        cliente: client,
                        status: 'error',
                        errorMessage: 'Excepción durante procesamiento',
                        errorDetail: err.message,
                        processedBy: 'manual'
                    });
                    logger.error(`Job ${jobId}: excepción - ${err.message}`);
                }
            });

            // ────────────────────────────────────────────────────────────
            // RESPUESTA: Estado de encolamiento
            // ────────────────────────────────────────────────────────────
            results.push({
                filename,
                status: enqueued ? 'queued' : 'queue_full',
                message: enqueued ? 'En cola' : 'Cola llena'
            });
        }

        res.json({ results });
    } catch (err) {
        logger.error(`Error en upload: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
}

/**
 * Exporta middleware y función del controlador
 * 
 * - upload: middleware multer para recibir archivos
 *   Se registra como: router.post('/upload', upload, processUpload)
 * 
 * - processUpload: función que procesa archivos validados
 *   Llamada automáticamente por Express después de multer
 */
module.exports = { upload, processUpload };