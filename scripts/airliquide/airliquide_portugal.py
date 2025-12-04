#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
PROCESADOR DE ARCHIVOS - AIR LIQUIDE PORTUGAL
================================================================================
Descripción:
    Procesa archivos TXT de pedidos de Air Liquide Portugal y genera
    archivos Excel con información estructurada de pedidos, viajes y descargas.

Modo de uso:
    - API:   python airliquide_portugal.py <folder> <filename> <metadata>
    - Batch: python airliquide_portugal.py --watch

Autor: Esteban García
Empresa: Babé y Cía Transportes
Fecha: Noviembre 2025
================================================================================
"""

import os
import sys
import glob
import logging
import shutil
import re
from datetime import datetime
from pathlib import Path

import pandas as pd

# ================================================================================
# CONFIGURACIÓN GLOBAL
# ================================================================================

# PRODUCCIÓN
BASE_WORK_DIR = r"H:/DISTRIBUCIÓN OTROS/AL PORTUGAL/pedidos/pedidos_pt"

# DESARROLLO (comentar en producción)
# BASE_WORK_DIR = os.path.join(os.path.dirname(__file__), "test_portugal")

IN_DIR_NAME = "entrada"
OUT_DIR_NAME = "salida"
PROCESADOS_DIR_NAME = "procesados"
ERROR_DIR_NAME = "errores"
LOG_DIR_NAME = "logs"

CLIENTE = "AIRLIQUIDE_PORTUGAL"

# ================================================================================
# CONFIGURACIÓN DE LOGGING
# ================================================================================

log_dir = os.path.join(BASE_WORK_DIR, LOG_DIR_NAME)
os.makedirs(log_dir, exist_ok=True)

timestamp_log = datetime.now().strftime("%Y%m%d_%H%M%S")
log_file = os.path.join(log_dir, f"log_{timestamp_log}.txt")

logging.basicConfig(
    filename=log_file,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    force=True
)
logger = logging.getLogger("portugal_processor")

# También log a consola
console = logging.StreamHandler()
console.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S")
console.setFormatter(formatter)
logger.addHandler(console)

logger.info("=" * 80)
logger.info("SESIÓN INICIADA: Air Liquide Portugal")
logger.info("=" * 80)

# ================================================================================
# VALIDACIÓN DE DEPENDENCIAS
# ================================================================================

try:
    import pandas as pd
except ImportError:
    logger.error("DEPENDENCIA FALTANTE: pandas no está instalado")
    print("[ERROR] pandas no instalado. Ejecuta: pip install pandas openpyxl")
    sys.exit(1)

# ================================================================================
# FUNCIONES AUXILIARES
# ================================================================================

def formatear_decimal(valor):
    """
    Formatea un valor decimal para Excel.
    
    Args:
        valor: Cadena con el valor decimal
        
    Returns:
        str: Valor formateado
    """
    if not valor or not valor.strip():
        return "0"
    
    valor = valor.strip()
    
    # Si tiene punto y coma (formato europeo mixto), quitar puntos
    if '.' in valor and ',' in valor:
        valor = valor.replace(".", "")
    
    return valor


def convertir_fecha(fecha):
    """
    Convierte formato de fecha de puntos a barras.
    
    Args:
        fecha: Fecha en formato DD.MM.YYYY
        
    Returns:
        str: Fecha en formato DD/MM/YYYY
    """
    if not fecha or not fecha.strip():
        return ""
    
    fecha = fecha.strip()
    
    # Formato DD.MM.YYYY
    if re.match(r'^\d{2}\.\d{2}\.\d{4}$', fecha):
        return fecha.replace(".", "/")
    
    return fecha


def detectar_encoding(archivo_path):
    """
    Detecta el encoding del archivo automáticamente.
    
    Args:
        archivo_path: Ruta del archivo
        
    Returns:
        str: Encoding detectado
    """
    encodings = ['utf-16', 'utf-16-le', 'utf-8', 'latin-1', 'cp1252']
    
    for enc in encodings:
        try:
            with open(archivo_path, 'r', encoding=enc) as f:
                content = f.read(100)
                if content.strip():
                    logger.info(f"  └─ Encoding detectado: {enc}")
                    return enc
        except (UnicodeDecodeError, UnicodeError, Exception):
            continue
    
    logger.warning("No se pudo detectar encoding, usando UTF-16 por defecto")
    return 'utf-16'


def validar_acceso_archivo(archivo_path):
    """
    Valida que un archivo esté accesible.
    
    Args:
        archivo_path: Ruta del archivo
        
    Returns:
        bool: True si el archivo es accesible
    """
    if not os.path.exists(archivo_path):
        logger.error(f"Archivo no encontrado: {archivo_path}")
        return False
    
    if os.path.getsize(archivo_path) == 0:
        logger.error(f"Archivo vacío: {archivo_path}")
        return False
    
    try:
        encoding = detectar_encoding(archivo_path)
        with open(archivo_path, 'r', encoding=encoding) as f:
            f.read(1)
        return True
    except Exception as e:
        logger.error(f"Archivo inaccesible: {e}")
        return False

# ================================================================================
# FUNCIÓN PRINCIPAL DE PROCESAMIENTO
# ================================================================================

def procesar_archivo_txt(archivo_txt_path):
    """
    Procesa un archivo TXT de pedidos y genera Excel.
    
    Args:
        archivo_txt_path: Ruta del archivo TXT a procesar
        
    Returns:
        bool: True si el procesamiento fue exitoso
    """
    nombre_archivo = os.path.basename(archivo_txt_path)
    
    logger.info("-" * 80)
    logger.info(f"INICIO PROCESAMIENTO: {nombre_archivo}")
    logger.info("-" * 80)
    
    # Validar acceso
    if not validar_acceso_archivo(archivo_txt_path):
        logger.error("Procesamiento abortado: archivo no accesible")
        return False
    
    # Variables de estado por archivo
    apariciones_por_vehiculo = {}
    descargas_por_viaje = {}
    pedido_actual = None
    vehiculo_actual = None
    viaje_actual = 0
    datos = []
    
    try:
        # Detectar y leer archivo con encoding correcto
        encoding = detectar_encoding(archivo_txt_path)
        logger.info(f"Procesando con encoding: {encoding}")
        
        with open(archivo_txt_path, 'r', encoding=encoding) as f:
            lineas = f.readlines()
        
        logger.info(f"Archivo cargado: {len(lineas)} líneas")
        
        # Si no hay líneas, archivo está vacío
        if len(lineas) == 0:
            logger.warning("Archivo vacío después de leer")
            error_dir = os.path.join(BASE_WORK_DIR, ERROR_DIR_NAME)
            os.makedirs(error_dir, exist_ok=True)
            shutil.move(archivo_txt_path, os.path.join(error_dir, nombre_archivo))
            logger.info("Archivo vacío movido a: ERRORES")
            return False
        
        lineas_procesadas = 0
        
        for linea in lineas:
            linea = linea.strip()
            
            # Saltar líneas vacías o de encabezado
            if not linea or "Transportes" in linea or "Loc.exped" in linea:
                continue
            
            lineas_procesadas += 1
            
            # Dividir campos por tabulador
            campos = [c.strip() for c in linea.split('\t') if c.strip()]
            
            if not campos:
                continue
            
            # ===== DETECTAR PEDIDO (10 dígitos) =====
            if len(campos[0]) == 10 and campos[0].isdigit():
                
                # Buscar vehículo en la línea
                vehiculo = None
                for campo in campos:
                    if campo.startswith("VH"):
                        vehiculo = campo
                        break
                
                if vehiculo:
                    # === CABECERA DE PEDIDO ===
                    pedido_actual = campos[0]
                    vehiculo_actual = vehiculo
                    
                    # Contar apariciones del vehículo
                    if vehiculo_actual not in apariciones_por_vehiculo:
                        apariciones_por_vehiculo[vehiculo_actual] = 1
                    else:
                        apariciones_por_vehiculo[vehiculo_actual] += 1
                    
                    viaje_actual = apariciones_por_vehiculo[vehiculo_actual]
                    clave_viaje = f"{vehiculo_actual}-{viaje_actual}"
                    descargas_por_viaje[clave_viaje] = {}
                    
                    logger.info(f"  └─ PEDIDO: {pedido_actual} | {vehiculo_actual} | Viaje: {viaje_actual}")
                    continue
                
                else:
                    # === DETALLE DE PEDIDO ===
                    num_detalle = campos[0]
                    
                    # Buscar fecha (formato DD.MM.YYYY)
                    fecha_encontrada = ""
                    for campo in campos:
                        if re.match(r'^\d{2}\.\d{2}\.\d{4}$', campo):
                            fecha_encontrada = campo
                            break
                    
                    fecha = convertir_fecha(fecha_encontrada)
                    
                    # Buscar índice de dirección PT
                    idx_pt = -1
                    for i, campo in enumerate(campos):
                        if re.match(r'^PT\s+\d', campo):
                            idx_pt = i
                            break
                    
                    # Extraer datos del cliente
                    cod_cli = campos[idx_pt - 2] if idx_pt >= 2 else ""
                    cliente = campos[idx_pt - 1] if idx_pt >= 1 else ""
                    direccion = campos[idx_pt] if idx_pt >= 0 else ""
                    
                    # Calcular número de descarga
                    clave_viaje = f"{vehiculo_actual}-{viaje_actual}"
                    
                    if cod_cli not in descargas_por_viaje[clave_viaje]:
                        descargas_por_viaje[clave_viaje][cod_cli] = len(descargas_por_viaje[clave_viaje]) + 1
                    
                    descarga_actual = descargas_por_viaje[clave_viaje][cod_cli]
                    
                    # Extraer números (volumen y peso)
                    numeros = [c for c in campos if re.match(r'^[\d\.,]+$', c)]
                    
                    volumen = "0"
                    peso = "0"
                    
                    if len(numeros) >= 2:
                        volumen = formatear_decimal(numeros[-2])
                        peso = formatear_decimal(numeros[-1])
                    elif len(numeros) == 1:
                        peso = formatear_decimal(numeros[0])
                    
                    # Parsear dirección (PT 1234-567 CIUDAD)
                    pais = ""
                    cod_postal = ""
                    poblacion = ""
                    
                    match = re.match(r'^(PT)\s+([\d\-]+)\s+(.+)$', direccion)
                    if match:
                        pais = match.group(1)
                        cod_postal = match.group(2)
                        poblacion = match.group(3)
                    
                    # Crear registro
                    datos.append({
                        "Nº PEDIDO": pedido_actual,
                        "Nº PEDIDO DETALLE": num_detalle,
                        "FECHA": fecha,
                        "CLIENTE": cliente,
                        "CODIGO CLIENTE": cod_cli,
                        "DIRECCION": direccion,
                        "PESO": peso,
                        "VOLUMEN": volumen,
                        "PAIS": pais,
                        "CODIGO POSTAL": cod_postal,
                        "POBLACION": poblacion,
                        "VEHICULO": vehiculo_actual,
                        "VIAJE": viaje_actual,
                        "DESCARGA": descarga_actual
                    })
        
        logger.info(f"Líneas procesadas: {lineas_procesadas}")
        logger.info(f"Registros generados: {len(datos)}")
        
        # Generar Excel si hay datos
        if len(datos) > 0:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            base_name = os.path.splitext(nombre_archivo)[0]
            nombre_xls = f"pedidos_{base_name}_{timestamp}.xlsx"
            
            out_dir = os.path.join(BASE_WORK_DIR, OUT_DIR_NAME)
            os.makedirs(out_dir, exist_ok=True)
            ruta_xls = os.path.join(out_dir, nombre_xls)
            
            # Crear DataFrame y exportar
            df = pd.DataFrame(datos)
            df.to_excel(ruta_xls, sheet_name="Pedidos", index=False, engine='openpyxl')
            
            logger.info(f"✓ Excel generado: {nombre_xls}")
            
            # Mover TXT a procesados
            procesados_dir = os.path.join(BASE_WORK_DIR, PROCESADOS_DIR_NAME)
            os.makedirs(procesados_dir, exist_ok=True)
            shutil.move(archivo_txt_path, os.path.join(procesados_dir, nombre_archivo))
            logger.info("Archivo movido a: PROCESADOS")
            
            return True
        
        else:
            logger.warning("Sin datos para generar Excel")
            
            # Mover a errores
            error_dir = os.path.join(BASE_WORK_DIR, ERROR_DIR_NAME)
            os.makedirs(error_dir, exist_ok=True)
            shutil.move(archivo_txt_path, os.path.join(error_dir, nombre_archivo))
            logger.info("Archivo movido a: ERRORES")
            
            return False
    
    except Exception as e:
        logger.exception(f"Error procesando archivo: {e}")
        
        # Mover a errores
        try:
            error_dir = os.path.join(BASE_WORK_DIR, ERROR_DIR_NAME)
            os.makedirs(error_dir, exist_ok=True)
            shutil.move(archivo_txt_path, os.path.join(error_dir, nombre_archivo))
            logger.info("Archivo movido a: ERRORES")
        except Exception as move_error:
            logger.error(f"No se pudo mover archivo a errores: {move_error}")
        
        return False

# ================================================================================
# MODO BATCH (PROCESAR CARPETA COMPLETA)
# ================================================================================

def procesar_carpeta_batch():
    """
    Procesa todos los archivos TXT en la carpeta de entrada (modo --watch).
    """
    logger.info("=" * 80)
    logger.info("MODO BATCH: Procesando carpeta completa")
    logger.info("=" * 80)
    
    in_dir = os.path.join(BASE_WORK_DIR, IN_DIR_NAME)
    
    # Crear directorio de entrada si no existe
    os.makedirs(in_dir, exist_ok=True)
    
    # Buscar archivos TXT ordenados por fecha de modificación
    patron = os.path.join(in_dir, "*.txt")
    archivos_txt = sorted(glob.glob(patron), key=os.path.getmtime)
    
    total_archivos = len(archivos_txt)
    logger.info(f"Archivos encontrados: {total_archivos}")
    
    if total_archivos == 0:
        logger.info("No hay archivos para procesar")
        print("[INFO] No hay archivos en la carpeta de entrada")
        return
    
    archivos_exitosos = 0
    archivos_fallidos = 0
    
    # Procesar cada archivo secuencialmente
    for idx, ruta in enumerate(archivos_txt, 1):
        nombre_archivo = os.path.basename(ruta)
        logger.info(f"\n[{idx}/{total_archivos}] Procesando: {nombre_archivo}")
        print(f"[{idx}/{total_archivos}] Procesando: {nombre_archivo}")
        
        exito = procesar_archivo_txt(ruta)
        
        if exito:
            archivos_exitosos += 1
        else:
            archivos_fallidos += 1
    
    # Resumen final
    logger.info("=" * 80)
    logger.info("RESUMEN DE PROCESAMIENTO")
    logger.info("=" * 80)
    logger.info(f"Total archivos: {total_archivos}")
    logger.info(f"✓ Exitosos: {archivos_exitosos}")
    logger.info(f"✗ Fallidos: {archivos_fallidos}")
    logger.info("=" * 80)
    
    print(f"\n[RESUMEN]")
    print(f"Total archivos: {total_archivos}")
    print(f"Procesados exitosamente: {archivos_exitosos}")
    print(f"Fallidos: {archivos_fallidos}")

# ================================================================================
# MODO API (PROCESAR ARCHIVO INDIVIDUAL)
# ================================================================================

def procesar_archivo_api(folder_name, filename, metadata):
    """
    Procesa un archivo individual llamado desde la API.
    
    Args:
        folder_name: Nombre de la carpeta (folder del cliente)
        filename: Nombre del archivo
        metadata: JSON string con metadatos
    """
    logger.info("=" * 80)
    logger.info(f"MODO API: Archivo individual")
    logger.info(f"Folder: {folder_name} | File: {filename}")
    logger.info("=" * 80)
    
    in_dir = os.path.join(BASE_WORK_DIR, IN_DIR_NAME)
    ruta = os.path.join(in_dir, filename)
    
    if not os.path.exists(ruta):
        logger.error(f"Archivo no encontrado: {ruta}")
        print(f"[ERROR] Archivo no encontrado: {ruta}")
        sys.exit(1)
    
    exito = procesar_archivo_txt(ruta)
    sys.exit(0 if exito else 1)

# ================================================================================
# INICIALIZACIÓN DE ESTRUCTURA DE CARPETAS
# ================================================================================

def inicializar_estructura():
    """
    Crea la estructura de carpetas necesaria.
    """
    carpetas = [
        os.path.join(BASE_WORK_DIR, IN_DIR_NAME),
        os.path.join(BASE_WORK_DIR, OUT_DIR_NAME),
        os.path.join(BASE_WORK_DIR, PROCESADOS_DIR_NAME),
        os.path.join(BASE_WORK_DIR, ERROR_DIR_NAME),
        os.path.join(BASE_WORK_DIR, LOG_DIR_NAME)
    ]
    
    for carpeta in carpetas:
        os.makedirs(carpeta, exist_ok=True)

# ================================================================================
# PUNTO DE ENTRADA
# ================================================================================

if __name__ == "__main__":
    # Inicializar estructura de carpetas
    inicializar_estructura()
    
    if len(sys.argv) == 4:
        # Modo API: folder, filename, metadata
        folder_name = sys.argv[1]
        filename = sys.argv[2]
        metadata = sys.argv[3]
        procesar_archivo_api(folder_name, filename, metadata)
        
    elif len(sys.argv) == 2 and sys.argv[1] == "--watch":
        # Modo batch: procesar carpeta completa
        procesar_carpeta_batch()
        
    else:
        # Uso incorrecto
        print("USO:")
        print("  Modo API:   python airliquide_portugal.py <folder> <filename> <metadata>")
        print("  Modo Batch: python airliquide_portugal.py --watch")
        sys.exit(1)