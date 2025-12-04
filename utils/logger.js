/**
 * ================================================================================
 * LOGGER UNIFICADO - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Registrar logs de servidor y ejecución de scripts
 * - Rotación diaria de archivos de log (14 días)
 * - Consola + archivo unificado
 * - Funciones helper para logs de scripts (info y error)
 * 
 * Cómo ampliar:
 * - Cambiar nivel de log ('info', 'debug', 'error')
 * - Añadir más transportes (ej: remote, Slack, Graylog)
 * - Personalizar formato de salida
 * ================================================================================
 */

const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.resolve(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// Transporte diario
const transport = new winston.transports.DailyRotateFile({
    dirname: LOG_DIR,
    filename: 'monitor-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxFiles: '14d',
    zippedArchive: false
});

const logger = winston.createLogger({
    level: 'info', 
    format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `${timestamp} [${level}] ${message} ${metaStr}`;
        })
    ),
    transports: [ transport, new winston.transports.Console() ],
    exitOnError: false
});

// Helpers para scripts
logger.scriptError = (jobId, script, err) => {
    logger.error(`Job ${jobId} | Script ${script} | Error: ${err.message}`, { stack: err.stack });
};

logger.scriptInfo = (jobId, script, msg, meta = {}) => {
    logger.info(`Job ${jobId} | Script ${script} | ${msg}`, meta);
};

module.exports = logger;
