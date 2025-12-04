/**
 * ================================================================================
 * RUTAS DE AUTOMATIZACIÓN - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Exponer endpoint para recibir jobs desde Power Automate
 * - Validar clave API antes de aceptar jobs
 * - Encolar ejecución de scripts según carpeta
 * - Registrar resultados en historial y logs
 * 
 * Flujo principal:
 * 1. POST /run con headers `x-api-key` y body { folder, filename, metadata }
 * 2. Validación de carpeta y script asignado (SCRIPTS_MAP)
 * 3. Generación de jobId (UUID)
 * 4. Encolado con `enqueue` para ejecución controlada
 * 5. Ejecución del script con `runScript`
 * 6. Guardado de resultados en `history` y logs
 * 7. Respuesta al cliente: 202 si encolado, 429 si la cola está llena
 * 
 * Cómo ampliar:
 * - Añadir más endpoints de automatización siguiendo la misma estructura
 * - Configurar nuevos scripts en `scripts-map.json`
 * - Integrar validaciones adicionales en metadata o filename
 * - Gestionar diferentes colas o prioridades según carpeta
 * 
 * ================================================================================
 */

const express = require('express');
const { validateApiKey } = require('../middlewares/auth.middleware');
const { runScript, enqueue, MAX_QUEUE_SIZE } = require('../utils/executor');
const logger = require('../utils/logger');
const history = require('../utils/history');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const router = express.Router();
const SCRIPTS_MAP = require('../config/scripts-map.json');

/**
 * POST /run
 * Endpoint para recibir jobs desde Power Automate
 * Headers: x-api-key
 * Body: { folder, filename, metadata? }
 */
router.post('/run', validateApiKey, (req, res) => {
    const { folder, filename, metadata } = req.body || {};

    if (!folder || !filename) {
        return res.status(400).json({ error: 'folder and filename required' });
    }

    const scriptPath = SCRIPTS_MAP[folder];
    if (!scriptPath) {
        logger.error(`No hay script asignado para la carpeta: ${folder}`);
        return res.status(400).json({ error: 'No script assigned for this folder' });
    }

    const absolutePath = path.isAbsolute(scriptPath)
        ? scriptPath
        : path.join(__dirname, '../../', scriptPath);
    const jobId = uuidv4();

    logger.info(`Job ${jobId}: recibido Power Automate - folder=${folder}, filename=${filename}`);

    const enqueued = enqueue(async () => {
        try {
            const args = [folder, filename, JSON.stringify(metadata || {})];
            const result = await runScript(absolutePath, args, jobId);

            const success = result.exitCode === 0;
            await history.addEntry({
                filename,
                cliente: folder,
                status: success ? 'success' : 'error',
                errorMessage: success ? null : 'Error en script',
                errorDetail: success ? null : result.stderr,
                processedBy: 'power_automate'
            });

            logger.info(`Job ${jobId}: completado Power Automate - ${success ? 'éxito' : 'error'}`);
        } catch (err) {
            await history.addEntry({
                filename,
                cliente: folder,
                status: 'error',
                errorMessage: 'Excepción durante procesamiento',
                errorDetail: err.message,
                processedBy: 'power_automate'
            });
            logger.error(`Job ${jobId}: error Power Automate - ${err.message}`);
        }
    });

    if (!enqueued) {
        logger.warn(`Job ${jobId}: cola llena (${MAX_QUEUE_SIZE})`);
        return res.status(429).json({ status: 'error', message: 'Queue full, try later', jobId });
    }

    res.status(202).json({ status: 'queued', jobId });
});

module.exports = router;
