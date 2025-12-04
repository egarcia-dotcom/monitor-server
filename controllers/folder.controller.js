/**
 * ================================================================================
 * CONTROLADOR DE CARPETAS - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Escanear carpetas de entrada de clientes para detectar archivos pendientes
 * - Procesar carpetas completas invocando scripts de transformación en batch
 * - Gestionar encolamiento de trabajos y reportar estado
 * 
 * Clientes soportados:
 * - airliquide_bilbao, airliquide_galicia: PDFs (recorte por códigos de barras)
 * - airliquide_portugal: TXTs (conversión a Excel)
 * - nipongases: PDFs (recorte por códigos de barras)
 * ================================================================================
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { runScript, enqueue } = require('../utils/executor');
const logger = require('../utils/logger');
const { BASE_FOLDERS } = require('../config/constants');

const SCRIPTS_MAP = require('../config/scripts-map.json');

/**
 * Escanea todas las carpetas de entrada configuradas y detecta archivos pendientes
 * 
 * Endpoint: GET /api/scan-folders
 * 
 * Lógica:
 * 1. Itera sobre cada cliente en BASE_FOLDERS
 * 2. Determina la extensión esperada (.txt para Portugal, .pdf para otros)
 * 3. Cuenta archivos pendientes en cada carpeta
 * 4. Retorna solo carpetas con archivos disponibles
 * 
 * Response:
 * {
 *   "folders": [
 *     { "client": "airliquide_galicia", "count": 5, "files": [...] },
 *     { "client": "nipongases", "count": 2, "files": [...] }
 *   ]
 * }
 */
async function scanFolders(req, res) {
    try {
        const foldersWithFiles = [];

        // Iterar sobre todas las carpetas configuradas
        for (const [client, folderPath] of Object.entries(BASE_FOLDERS)) {
            // Saltar si la carpeta no existe
            if (!fs.existsSync(folderPath)) continue;

            // Determinar extensión según cliente
            const ext = client === 'airliquide_portugal' ? '.txt' : '.pdf';
            
            // Leer archivos con extensión correcta
            const files = fs.readdirSync(folderPath)
                .filter(f => path.extname(f).toLowerCase() === ext)
                .map(f => ({
                    name: f,
                    size: fs.statSync(path.join(folderPath, f)).size
                }));

            // Solo incluir carpetas que tienen archivos pendientes
            if (files.length > 0) {
                foldersWithFiles.push({ client, count: files.length, files });
            }
        }

        res.json({ folders: foldersWithFiles });
    } catch (err) {
        logger.error(`Error en scan-folders: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
}

/**
 * Procesa todos los archivos de una carpeta de cliente invocando su script en modo batch
 * 
 * Endpoint: POST /api/process-folder
 * 
 * Body:
 * {
 *   "client": "airliquide_galicia"  // Cliente cuya carpeta procesar
 * }
 * 
 * Lógica:
 * 1. Valida que el cliente esté configurado en SCRIPTS_MAP
 * 2. Obtiene la ruta del script correspondiente
 * 3. Resuelve ruta absoluta (maneja rutas relativas y absolutas)
 * 4. Encola el job con argumento "--watch" (modo batch)
 * 5. Retorna jobId para seguimiento en logs
 * 
 * Response exitosa:
 * { "status": "queued", "jobId": "uuid-aqui" }
 * 
 * Response error (cliente inválido):
 * { "error": "Cliente inválido" }
 * 
 * Response error (cola llena):
 * { "error": "Cola llena, intenta más tarde" }
 */
async function processFolder(req, res) {
    try {
        const { client } = req.body;
        
        // Validar que cliente existe en configuración
        if (!client || !SCRIPTS_MAP[client]) {
            return res.status(400).json({ error: 'Cliente inválido' });
        }

        // Obtener ruta del script del cliente
        const scriptPath = SCRIPTS_MAP[client];
        
        // Resolver ruta absoluta: si es relativa, se asume relativa a monitor-server/
        const absoluteScriptPath = path.isAbsolute(scriptPath)
            ? scriptPath
            : path.join(__dirname, '../../', scriptPath);

        // Generar ID único para este job
        const jobId = uuidv4();
        logger.info(`Job ${jobId}: procesamiento carpeta - ${client}`);

        // Encolar el procesamiento (respeta límite de concurrencia MAX_CONCURRENT)
        const enqueued = enqueue(async () => {
            try {
                // Pasar "--watch" al script para modo batch (procesa toda la carpeta)
                const args = ['--watch'];
                const result = await runScript(absoluteScriptPath, args, jobId);
                
                const success = result.exitCode === 0;
                logger.info(`Job ${jobId}: carpeta procesada - ${success ? 'éxito' : 'error'}`);
            } catch (err) {
                logger.error(`Job ${jobId}: error procesando carpeta - ${err.message}`);
            }
        });

        // Verificar si el job se encolo exitosamente
        if (!enqueued) {
            return res.status(429).json({ error: 'Cola llena, intenta más tarde' });
        }

        res.json({ status: 'queued', jobId });
    } catch (err) {
        logger.error(`Error en process-folder: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
}

/**
 * Exporta funciones del controlador
 * 
 * Estas funciones se registran en las rutas:
 * - GET /api/scan-folders -> scanFolders
 * - POST /api/process-folder -> processFolder
 */
module.exports = { scanFolders, processFolder };