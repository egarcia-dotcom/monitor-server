/**
 * ================================================================================
 * HISTORIAL DE PROCESAMIENTO - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Guardar historial de archivos procesados
 * - Mantener estado: éxito, error, mensaje y detalle
 * - Limpiar entradas antiguas automáticamente (30 días)
 * - Permitir recuperación de todas las entradas
 * 
 * Cómo ampliar:
 * - Cambiar RETENTION_DAYS para mayor o menor retención
 * - Añadir más campos por entrada si se requiere
 * - Integrar base de datos si el volumen supera archivos JSON
 * ================================================================================
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '../data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const RETENTION_DAYS = 30;

const initialData = { entries: [], lastCleanup: new Date().toISOString() };

// Inicializa historial y limpia entradas antiguas
function init() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, JSON.stringify(initialData, null, 2));
    cleanup();
}

// Leer historial
function read() {
    try {
        return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch {
        return initialData;
    }
}

// Escribir historial
function write(data) {
    try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2)); } catch {}
}

/**
 * Añade una nueva entrada al historial
 * @param {Object} param0
 * @param {string} param0.filename
 * @param {string} param0.cliente
 * @param {string} param0.status - 'success' | 'error'
 * @param {string|null} param0.errorMessage
 * @param {string|null} param0.errorDetail
 * @param {string} param0.processedBy
 */
async function addEntry({ filename, cliente, status, errorMessage = null, errorDetail = null, processedBy = 'unknown' }) {
    const data = read();
    const entry = { id: uuidv4(), filename, cliente, status, timestamp: new Date().toISOString(), errorMessage, errorDetail, processedBy };
    data.entries.push(entry);
    write(data);
    return entry;
}

// Devuelve todas las entradas
async function getEntries() {
    return read().entries;
}

// Elimina entradas más antiguas que RETENTION_DAYS
function cleanup() {
    const data = read();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const before = data.entries.length;
    data.entries = data.entries.filter(e => new Date(e.timestamp) > cutoff);
    if (data.entries.length < before) {
        data.lastCleanup = new Date().toISOString();
        write(data);
    }
}

module.exports = { init, addEntry, getEntries, cleanup };