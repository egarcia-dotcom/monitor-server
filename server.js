// monitor-server/server.js
const express = require('express');
const path = require('path');
const logger = require('./utils/logger');
const routes = require('./routes');
const { errorHandler } = require('./middlewares/error.middleware');
const { PORT } = require('./config/constants');

const app = express();

// Middlewares globales
app.use(express.json());                      // Parsear JSON
app.use(express.urlencoded({ extended: true })); // Parsear form data
app.use(express.static('public'));            // Servir archivos estáticos

// Registrar rutas
app.use('/', routes);

// Manejador de errores (siempre al final)
app.use(errorHandler);

// Iniciar servidor
app.listen(PORT, () => {
    logger.info(`Servidor monitor escuchando en puerto ${PORT}`);
});