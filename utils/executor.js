/**
 * ================================================================================
 * EJECUTOR DE SCRIPTS - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Ejecutar scripts Python (.py) de manera controlada
 * - Gestionar concurrencia y cola de ejecución
 * - Registrar logs de inicio, salida y errores
 * - Evitar que un mismo script se ejecute simultáneamente
 * 
 * Limitaciones:
 * - MAX_CONCURRENT = 1 (solo un script a la vez)
 * - MAX_QUEUE_SIZE = 20 jobs
 * - Timeout configurable por script (TIMEOUTS)
 * 
 * Cómo ampliar:
 * - Aumentar MAX_CONCURRENT para permitir paralelismo
 * - Añadir más scripts a TIMEOUTS si tienen diferentes tiempos máximos
 * - Integrar prioridades en la cola (jobs críticos primero)
 * ================================================================================
 */

const { spawn } = require('child_process');
const path = require('path');
const logger = require('./logger');

// Configuración de concurrencia y cola
const MAX_CONCURRENT = 1;
const MAX_QUEUE_SIZE = 20;
let running = 0;
const queue = [];
const runningScripts = {}; // Scripts en ejecución para evitar solapamientos

// Timeout por script en milisegundos
const TIMEOUTS = {
    'airliquide.py': 3 * 60 * 1000,
    'nipongases.py': 3 * 60 * 1000,
    'airliquide_portugal.py': 1 * 60 * 1000
};

/**
 * Encola un job para ejecución controlada
 * @param {Function} jobFunc - Función async que ejecuta el job
 * @returns {boolean} - false si la cola está llena
 */
function enqueue(jobFunc) {
    if (queue.length >= MAX_QUEUE_SIZE) return false;
    queue.push(jobFunc);
    processQueue();
    return true;
}

/**
 * Procesa la cola respetando la concurrencia máxima
 */
function processQueue() {
    if (running >= MAX_CONCURRENT) return;
    const jobFunc = queue.shift();
    if (!jobFunc) return;
    running++;
    jobFunc().finally(() => {
        running--;
        processQueue();
    });
}

/**
 * Ejecuta un script Python con timeout y logging
 * @param {string} scriptPath - Ruta del script
 * @param {Array} args - Argumentos para el script
 * @param {string} jobId - ID único del job
 * @returns {Promise<Object>} - Resultado con exitCode, stdout, stderr
 */
function runScript(scriptPath, args = [], jobId) {
    return new Promise((resolve, reject) => {
        const scriptName = path.basename(scriptPath);

        if (runningScripts[scriptName]) {
            logger.warn(`Job ${jobId}: el script ${scriptName} ya se está ejecutando`);
            return reject(new Error('Script already running'));
        }
        runningScripts[scriptName] = true;

        const ext = path.extname(scriptPath).toLowerCase();
        if (ext !== '.py') {
            runningScripts[scriptName] = false;
            return reject(new Error(`Extensión de script no soportada: ${ext}`));
        }

        const timeout = TIMEOUTS[scriptName] || 3 * 60 * 1000;
        logger.info(`Job ${jobId}: iniciando script ${scriptName}`);

        const child = spawn('python', [scriptPath, ...args.map(String)]);
        let stdout = '';
        let stderr = '';

        const killTimer = setTimeout(() => {
            child.kill('SIGTERM');
            logger.error(`Job ${jobId}: script ${scriptName} superó timeout de ${timeout}ms y fue terminado`);
        }, timeout);

        child.stdout.on('data', data => { stdout += data.toString(); });
        child.stderr.on('data', data => { stderr += data.toString(); });

        child.on('close', code => {
            clearTimeout(killTimer);
            runningScripts[scriptName] = false;
            resolve({
                jobId,
                script: scriptName,
                exitCode: code,
                stdout: stdout.slice(0, 20000),
                stderr: stderr.slice(0, 20000)
            });
        });

        child.on('error', err => {
            clearTimeout(killTimer);
            runningScripts[scriptName] = false;
            logger.error(`Job ${jobId}: error ejecutando script ${err.message}`);
            reject(err);
        });
    });
}

module.exports = { runScript, enqueue, MAX_QUEUE_SIZE };
