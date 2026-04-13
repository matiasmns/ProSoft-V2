# Calibracion de muestras para densitograma

Este documento se usa para cargar muestras reales comparando el motor automatico contra el informe/PDF externo validado.

Objetivo:

- Medir el error del motor por fraccion.
- Medir el desplazamiento de los separadores.
- Detectar patrones de falla por valle falso o fraccion colapsada.
- Definir offsets o un perfil global de calibracion para el backend.

## Reglas de carga

- Usar muestras del mismo equipo/metodo.
- Mantener el mismo criterio de recorte de imagen.
- Cargar siempre los 6 porcentajes del PDF.
- Si esta disponible, cargar `T.P.` o concentracion total.
- Copiar los rangos tal como los muestra el sistema en `Diagnostico tecnico`.
- Si una muestra tiene error de transcripcion o mala imagen, marcarla como `descartar`.

## Formato de fracciones

Orden fijo:

1. Albumina
2. Alfa 1
3. Alfa 2
4. Beta 1
5. Beta 2
6. Gamma

## Muestra 01

Estado: incluir

Observaciones:

- 

T.P.:7.5

```text

```

### Motor automatico

```text
Albumina: 59.59
Alfa 1: 1.09
Alfa 2: 9.26
Beta 1: 9.63
Beta 2: 5.40
Gamma: 15.03
```

### PDF validado

```text
Albumina: 57.4
Alfa 1: 4.2
Alfa 2: 12.0
Beta 1: 6.1
Beta 2: 6.0
Gamma: 14.3
```

### Rango motor

```text
Albumina: 0.0% - 60.1%	
Alfa 1: 60.1% - 62.6%
Alfa 2: 62.6% - 71.7%	
Beta 1: 71.7% - 80.2%
Beta 2: 80.2% - 86.5%	
Gamma: 86.5% - 100.0%	
```

### Rango tabla / calibrado

```text
Albumina: 0.0% - 57.2%
Alfa 1: 57.2% - 64.4%
Alfa 2: 64.4% - 75.7%
Beta 1: 75.7% - 80.5%
Beta 2: 80.5% - 87.3%
Gamma: 87.3% - 100.0%
```

### Diagnostico tecnico

```text
Motor:Backend FastAPI
Eje:x
Perfil: 482 puntos
Area total: 122.1589
Crop usado: x 23, y 26, ancho 482, alto 43
Picos: 124 (25.8%), 289 (60.1%), 330 (68.6%), 369 (76.7%), 405 (84.2%), 445 (92.5%)
Minimos: 289 (60.1%), 301 (62.6%), 345 (71.7%), 386 (80.2%), 416 (86.5%)
```

## Muestra 02

Estado: incluir

Observaciones:

- 

T.P.: 7.7

```text

```

### Motor automatico

```text
Albumina: 60.28
Alfa 1: 1.21
Alfa 2: 8.79
Beta 1: 6.97
Beta 2: 22.66
Gamma: 0.08
```

### PDF validado

```text
Albumina: 62.4
Alfa 1: 3.6
Alfa 2: 9.8
Beta 1: 6.1
Beta 2: 4.2
Gamma: 13.9
```

### Rango motor

```text
Albumina: 0.0% - 57.2%
Alfa 1: 57.2% - 59.6%
Alfa 2: 59.6% - 66.4%
Beta 1: 66.4% - 73.0%
Beta 2: 73.0% - 90.0%
Gamma: 90.0% - 100.0%
```

### Rango tabla / calibrado

```text
Albumina: 0.0% - 60.8%
Alfa 1: 60.8% - 63.0%
Alfa 2: 63.0% - 71.5%
Beta 1: 71.5% - 76.6%
Beta 2: 76.6% - 79.1%
Gamma: 79.1% - 100.0%
```

### Diagnostico tecnico

```text
Motor: Backend FastAPI
Eje: X
Perfil: 412 puntos
Area total: 86.5118
Crop usado: x 0, y 7, ancho 412, alto 55
Picos: 110 (26.8%), 245 (59.6%), 260 (63.3%), 290 (70.6%), 334 (81.3%), 370 (90.0%)
Minimos: 235 (57.2%), 245 (59.6%), 273 (66.4%), 300 (73.0%), 370 (90.0%)
```

## Muestra 03

Estado: incluir

Observaciones:

- 

T.P.: 7.31

```text

```

### Motor automatico

```text
Albumina: 59.73
Alfa 1: 9.02
Alfa 2: 8.58
Beta 1: 18.70
Beta 2: 3.95
Gamma: 0.03
```

### PDF validado

```text
Albumina: 58.3
Alfa 1: 4.6
Alfa 2: 10.9
Beta 1: 5.6
Beta 2: 5.7
Gamma: 14.9
```

### Rango motor

```text
Albumina: 0.0% - 57.8%
Alfa 1: 57.8% - 65.9%
Alfa 2: 65.9% - 71.7%
Beta 1: 71.7% - 82.1%
Beta 2: 82.1% - 88.2%
Gamma: 88.2% - 100.0%
```

### Rango tabla / calibrado

```text
Albumina: 0.0% - 55.8%
Alfa 1: 55.8% - 61.8%
Alfa 2: 61.8% - 69.6%
Beta 1: 69.6% - 73.4%
Beta 2: 73.4% - 76.4%
Gamma: 76.4% - 100.0%
```
## Muestra 04

Estado: incluir

Observaciones:

- 

T.P.: 7.1

```text

```

### Motor automatico

```text
Albumina: 60.03
Alfa 1: 1.67
Alfa 2: 7.65
Beta 1: 8.22
Beta 2: 22.37
Gamma: 0.06
```

### PDF validado

```text
Albumina: 55.2
Alfa 1: 4.3
Alfa 2: 11.2
Beta 1: 5.8
Beta 2: 5.7
Gamma: 14.8
```

### Rango motor

```text
Albumina: 0.0% - 59.3%
Alfa 1: 59.3% - 61.8%
Alfa 2: 61.8% - 67.4%
Beta 1: 67.4% - 73.4%
Beta 2: 73.4% - 90.0%
Gamma: 90.0% - 100.0%
```

### Rango tabla / calibrado

```text
Albumina: 0.0% - 56.5%
Alfa 1: 56.5% - 62.5%
Alfa 2: 62.5% - 70.6%
Beta 1: 70.6% - 75.2%
Beta 2: 75.2% - 78.9%
Gamma: 78.9% - 100.0%
```

### Diagnostico tecnico

```text
Motor: Backend FastAPI
Eje: x
Perfil: 433 puntos
Area total: 101.2584
Crop usado: x 0, y 7, ancho 433, alto 52
Picos: 125 (28.9%), 267 (61.8%), 276 (63.9%), 304 (70.4%), 353 (81.7%), 389 (90.0%)
Minimos: 256 (59.3%), 267 (61.8%), 291 (67.4%), 317 (73.4%), 389 (90.0%)
```

## Muestra 05

Estado: incluir

Observaciones:

- 

T.P.: 7.2

```text

```

### Motor automatico

```text
Albumina: 40.15
Alfa 1: 15.40
Alfa 2: 8.52
Beta 1: 7.83
Beta 2: 27.49
Gamma: 0.62
```

### PDF validado

```text
Albumina: 55.1
Alfa 1: 3.6
Alfa 2: 11.1
Beta 1: 5.2
Beta 2: 5.1
Gamma: 19.9
```

### Rango motor

```text
Albumina: 0.0% - 49.9%
Alfa 1: 49.9% - 61.7%
Alfa 2: 61.7% - 69.2%
Beta 1: 69.2% - 75.4%
Beta 2: 75.4% - 90.0%
Gamma: 90.0% - 100.0%
```

### Rango tabla / calibrado

```text
Albumina: 0.0% - 60.8%
Alfa 1: 60.8% - 65.4%
Alfa 2: 65.4% - 73.8%
Beta 1: 73.8% - 77.7%
Beta 2: 77.7% - 80.6%
Gamma: 80.6% - 100.0%
```

### Diagnostico tecnico

```text
Motor: Backend FastAPI
Eje: x
Perfil: 562 puntos
Area total: 129.6311
Crop usado: x 0, y 11, ancho 562, alto 70
Picos: 171 (30.5%), 305 (54.4%), 370 (66.0%), 409 (72.9%), 480 (85.6%), 505 (90.0%)
Minimos: 280 (49.9%), 346 (61.7%), 388 (69.2%), 423 (75.4%), 505 (90.0%)
```


## Muestra 06

Estado: incluir

Observaciones:

- 

T.P.: 

```text

```

### Motor automatico

```text
Albumina: 
Alfa 1: 
Alfa 2: 
Beta 1:
Beta 2: 
Gamma: 
```

### PDF validado

```text
Albumina: 
Alfa 1: 
Alfa 2: 
Beta 1: 
Beta 2: 
Gamma: 
```

### Rango motor

```text
Albumina: 
Alfa 1: 
Alfa 2: 
Beta 1: 
Beta 2: 
Gamma: 
```

### Rango tabla / calibrado

```text
Albumina: 
Alfa 1: 
Alfa 2: 
Beta 1: 
Beta 2: 
Gamma: 
```

### Diagnostico tecnico

```text
Motor: Backend FastAPI
Eje: x
Perfil: 
Area total: 
Crop usado: 
Picos: 
Minimos: 
```







--------------------------

## Resumen de calibracion

Base actual: 5 muestras reales.

Estado del set:

- Viable como primera calibracion exploratoria.
- Todavia no alcanza como calibracion final cerrada.
- Muestra 05 debe quedar marcada como `revisar` porque el motor desplaza mucho Albumina/Alfa 1.
- Muestras 02, 04 y 05 muestran el mismo problema critico: el motor corre el separador Beta 2 / Gamma demasiado a la derecha y deja Gamma casi en cero.
- Muestra 03 tambien muestra perdida de Gamma, pero con redistribucion fuerte hacia Beta 1.
- Muestra 01 es la mas estable del set.

Lectura principal:

- El motor automatico no esta fallando tanto por area total, sino por posicion de separadores.
- El separador 5 es el problema mas consistente.
- El promedio del separador 5 del motor es 88.94%.
- El promedio del separador 5 calibrado es 80.46%.
- Offset medio separador 5: -8.48 puntos porcentuales.
- Esto indica que Beta 2 esta absorbiendo area que corresponde a Gamma.

### Error promedio por fraccion

```text
Albumina: 5.10 puntos porcentuales
Alfa 1: 4.87 puntos porcentuales
Alfa 2: 2.44 puntos porcentuales
Beta 1: 4.51 puntos porcentuales
Beta 2: 11.97 puntos porcentuales
Gamma: 12.69 puntos porcentuales
```

### Desplazamiento promedio de separadores

Separadores:

1. Albumina / Alfa 1
2. Alfa 1 / Alfa 2
3. Alfa 2 / Beta 1
4. Beta 1 / Beta 2
5. Beta 2 / Gamma

```text
Separador 1: +1.36 puntos porcentuales promedio
Separador 2: +1.10 puntos porcentuales promedio
Separador 3: +2.96 puntos porcentuales promedio
Separador 4: -0.14 puntos porcentuales promedio
Separador 5: -8.48 puntos porcentuales promedio
```

### Promedio de separadores calibrados

```text
Separador 1: 58.22%
Separador 2: 63.42%
Separador 3: 72.24%
Separador 4: 76.68%
Separador 5: 80.46%
```

### Promedio de separadores del motor

```text
Separador 1: 56.86%
Separador 2: 62.32%
Separador 3: 69.28%
Separador 4: 76.82%
Separador 5: 88.94%
```

### Decision tecnica

```text
Perfil recomendado: v3.2 calibracion inicial por offsets conservadores de separadores.
Offsets recomendados: Separador 1 = 0.00, Separador 2 = +0.50, Separador 3 = +2.00, Separador 4 = 0.00, Separador 5 = -6.00 solo si cae >= 87.5%.
Muestras descartadas: ninguna por ahora.
Muestras a revisar: Muestra 05.
Motivo: el set confirma una falla sistematica de segmentacion Beta 2 / Gamma.
```
