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
Albumina: 59.99
Alfa 1: 2.11
Alfa 2: 17.71
Beta 1: 5.21
Beta 2: 13.88
Gamma: 1.10
```

### PDF validado

```text
Albumina: 58.2
Alfa 1: 4.3
Alfa 2: 11.2
Beta 1: 5.8
Beta 2: 5.7
Gamma: 14.8
```

### Rango motor

```text
Albumina: 0.0% - 59.3%
Alfa 1: 59.3% - 62.3%
Alfa 2: 62.3% - 75.5%
Beta 1: 75.5% - 78.9%
Beta 2: 78.9% - 87.0%
Gamma: 87.0% - 100.0%
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
Area total: 101.9569
Crop usado: x 0, y 0, ancho 433, alto 69
Picos: 125 (28.9%), 269 (62.3%), 276 (63.9%), 341 (78.9%), 353 (81.7%), 376 (87.0%)
Minimos: 256 (59.3%), 269 (62.3%), 326 (75.5%), 341 (78.9%), 376 (87.0%)
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

T.P.: 7.34

```text

```

### Motor automatico

```text
Albumina: 60.04
Alfa 1: 1.59
Alfa 2: 10.50
Beta 1: 7.51
Beta 2: 5.47
Gamma: 14.90
```

### PDF validado

```text
Albumina: 58.7
Alfa 1: 2.9
Alfa 2: 8.5
Beta 1: 5.9
Beta 2: 6.5
Gamma: 17.5
```

### Rango motor

```text
Albumina: 0.0% - 60.1%
Alfa 1: 60.1% - 63.1%
Alfa 2: 63.1% - 72.2%
Beta 1: 72.2% - 77.8%
Beta 2: 77.8% - 83.5%
Gamma: 83.5% - 100.0%
```

### Rango tabla / calibrado

```text
Albumina: 0.0% - 58.0%
Alfa 1: 58.0% - 63.1%
Alfa 2: 63.1% - 70.0%
Beta 1: 70.0% - 74.7%
Beta 2: 74.7% - 80.8%
Gamma: 80.8% - 100.0%
```

### Diagnostico tecnico

```text
Motor: Backend FastAPI
Eje: x
Perfil: 527 puntos
Area total: 128.0427
Crop usado: x 0, y 12, ancho 527, alto 77
Picos: 147 (27.9%), 332 (63.1%), 353 (67.1%), 392 (74.5%), 429 (81.6%), 468 (89.0%)
Minimos: 316 (60.1%), 332 (63.1%), 380 (72.2%), 409 (77.8%), 439 (83.5%)
```

## Muestra 07

Estado: incluir

Observaciones:

- 

T.P.: 6.78

```text

```

### Motor automatico

```text
Albumina: 47.30
Alfa 1: 13.01
Alfa 2: 11.03
Beta 1: 5.68
Beta 2: 3.92
Gamma: 19.06
```

### PDF validado

```text
Albumina: 61.1
Alfa 1: 3.0
Alfa 2: 9.8
Beta 1: 5.3
Beta 2: 4.3
Gamma: 16.5
```

### Rango motor

```text
Albumina: 0.0% - 50.1%
Alfa 1: 50.1% - 62.5%
Alfa 2: 62.5% - 72.3%
Beta 1: 72.3% - 76.7%
Beta 2: 76.7% - 80.1%
Gamma: 80.1% - 100.0%
```

### Rango tabla / calibrado

```text
Albumina: 0.0% - 64.0%
Alfa 1: 64.0% - 66.3%
Alfa 2: 66.3% - 74.1%
Beta 1: 74.1% - 78.7%
Beta 2: 78.7% - 81.8%
Gamma: 81.8% - 100.0%
```

### Diagnostico tecnico

```text
Motor: Backend FastAPI
Eje: x
Perfil: 348 puntos
Area total: 69.4594
Crop usado: x 0, y 3, ancho 348, alto 55
Picos: 105 (30.3%), 191 (55.0%), 233 (67.1%), 257 (74.1%), 278 (80.1%), 298 (85.9%)
Minimos: 174 (50.1%), 217 (62.5%), 251 (72.3%), 266 (76.7%), 278 (80.1%)
```

## Muestra 08

Estado: incluir

Observaciones:

- 

T.P.: 6.7

```text

```

### Motor automatico

```text
Albumina: 57.94
Alfa 1: 9.85
Alfa 2: 11.09
Beta 1: 21.05
Beta 2: 0.04
Gamma: 0.03
```

### PDF validado

```text
Albumina: 57.8
Alfa 1: 4.1
Alfa 2: 10.6
Beta 1: 5.6
Beta 2: 5.3
Gamma: 16.6
```

### Rango motor

```text
Albumina: 0.0% - 54.4%
Alfa 1: 54.4% - 62.1%
Alfa 2: 62.1% - 69.5%
Beta 1: 69.5% - 82.0%
Beta 2: 82.0% - 85.4%
Gamma: 85.4% - 100.0%
```

### Rango tabla / calibrado

```text
Albumina: 0.0% - 54.2%
Alfa 1: 54.2% - 58.0%
Alfa 2: 58.0% - 65.3%
Beta 1: 65.3% - 69.2%
Beta 2: 69.2% - 71.8%
Gamma: 71.8% - 100.0%
```

### Diagnostico tecnico

```text
Motor: Backend FastAPI
Eje: x
Perfil: 523 puntos
Area total: 110.0207
Crop usado: x 0, y 6, ancho 523, alto 62
Picos: 141 (27.0%), 306 (58.6%), 339 (64.9%), 390 (74.7%), 428 (82.0%), 460 (88.1%)
Minimos: 284 (54.4%), 324 (62.1%), 363 (69.5%), 428 (82.0%), 446 (85.4%)
```

## Muestra 09

Estado: incluir

Observaciones:

- 

T.P.: 6.7

```text

```

### Motor automatico

```text
Albumina: 59.79
Alfa 1: 1.97
Alfa 2: 9.49
Beta 1: 5.04
Beta 2: 22.53
Gamma: 1.19
```

### PDF validado

```text
Albumina: 63.9
Alfa 1: 3.0
Alfa 2: 9.0
Beta 1: 5.4
Beta 2: 4.5
Gamma: 14.8
```

### Rango motor

```text
Albumina: 0.0% - 59.2%
Alfa 1: 59.2% - 62.1%
Alfa 2: 62.1% - 69.5%
Beta 1: 69.5% - 73.2%
Beta 2: 73.2% - 87.0%
Gamma: 87.0% - 100.0%
```

### Rango tabla / calibrado

```text
Albumina: 0.0% - 63.6%
Alfa 1: 63.6% - 65.0%
Alfa 2: 65.0% - 72.4%
Beta 1: 72.4% - 76.9%
Beta 2: 76.9% - 79.4%
Gamma: 79.4% - 100.0%
```

### Diagnostico tecnico

```text
Motor: Backend FastAPI
Eje: x
Perfil: 569 puntos
Area total: 119.8612
Crop usado: x 0, y 4, ancho 569, alto 89
Picos: 164 (28.9%), 353 (62.1%), 365 (64.3%), 401 (70.6%), 465 (81.9%), 494 (87.0%)
Minimos: 336 (59.2%), 353 (62.1%), 395 (69.5%), 416 (73.2%), 494 (87.0%)
```

## Muestra 10

Estado: incluir

Observaciones:

- 

T.P.: 7.86

```text

```

### Motor automatico

```text
Albumina: 57.51
Alfa 1: 1.64
Alfa 2: 8.79
Beta 1: 4.47
Beta 2: 25.30
Gamma: 2.30
```

### PDF validado

```text
Albumina: 60.7
Alfa 1: 3.6
Alfa 2: 8.3
Beta 1: 5.4
Beta 2: 3.6
Gamma: 18.4
```

### Rango motor

```text
Albumina: 0.0% - 60.0%
Alfa 1: 60.0% - 63.1%
Alfa 2: 63.1% - 70.4%
Beta 1: 70.4% - 73.9%
Beta 2: 73.9% - 87.1%
Gamma: 87.1% - 100.0%
```

### Rango tabla / calibrado

```text
Albumina: 0.0% - 64.5%
Alfa 1: 64.5% - 66.4%
Alfa 2: 66.4% - 74.1%
Beta 1: 74.1% - 77.4%
Beta 2: 77.4% - 79.3%
Gamma: 79.3% - 100.0%
```

### Diagnostico tecnico

```text
Motor: Backend FastAPI
Eje: x
Perfil: 426 puntos
Area total: 97.2752
Crop usado: x 0, y 0, ancho 426, alto 69
Picos: 125 (29.4%), 268 (63.1%), 278 (65.4%), 306 (72.0%), 351 (82.6%), 370 (87.1%)
Minimos: 255 (60.0%), 268 (63.1%), 299 (70.4%), 314 (73.9%), 370 (87.1%)
```

## Muestra 11

Estado: incluir

Observaciones:

- 

T.P.: 7.08

```text

```

### Motor automatico

```text
Albumina: 63.41
Alfa 1: 11.19
Alfa 2: 10.38
Beta 1: 13.98
Beta 2: 1.02
Gamma: 0.01
```

### PDF validado

```text
Albumina: 59.2
Alfa 1: 5.4
Alfa 2: 12.6
Beta 1: 6.9
Beta 2: 4.9
Gamma: 11.0
```

### Rango motor

```text
Albumina: 0.0% - 56.8%
Alfa 1: 56.8% - 64.9%
Alfa 2: 64.9% - 72.4%
Beta 1: 72.4% - 82.1%
Beta 2: 82.1% - 86.3%
Gamma: 86.3% - 100.0%
```

### Rango tabla / calibrado

```text
Albumina: 0.0% - 52.8%
Alfa 1: 52.8% - 58.4%
Alfa 2: 58.4% - 67.1%
Beta 1: 67.1% - 71.9%
Beta 2: 71.9% - 75.1%
Gamma: 75.1% - 100.0%
```

### Diagnostico tecnico

```text
Motor: Backend FastAPI
Eje: x
Perfil: 520 puntos
Area total: 98.7378
Crop usado: x 0, y 0, ancho 520, alto 78
Picos: 152 (29.3%), 319 (61.5%), 352 (67.8%), 402 (77.5%), 426 (82.1%), 448 (86.3%)
Minimos: 295 (56.8%), 337 (64.9%), 376 (72.4%), 426 (82.1%), 448 (86.3%)
```

## Muestra 12

Estado: incluir

Observaciones:

- 

T.P.: 6.78

```text

```

### Motor automatico

```text
Albumina: 58.47
Alfa 1: 9.08
Alfa 2: 9.92
Beta 1: 22.14
Beta 2: 0.24
Gamma: 0.15
```

### PDF validado

```text
Albumina: 61.1
Alfa 1: 3.0
Alfa 2: 9.8
Beta 1: 5.3
Beta 2: 4.3
Gamma: 16.5
```

### Rango motor

```text
Albumina: 0.0% - 54.8%
Alfa 1: 54.8% - 62.3%
Alfa 2: 62.3% - 69.8%
Beta 1: 69.8% - 82.1%
Beta 2: 82.1% - 86.3%
Gamma: 86.3% - 100.0%
```

### Rango tabla / calibrado

```text
Albumina: 0.0% - 57.9%
Alfa 1: 57.9% - 59.4%
Alfa 2: 59.4% - 67.3%
Beta 1: 67.3% - 70.8%
Beta 2: 70.8% - 72.7%
Gamma: 72.7% - 100.0%
```

### Diagnostico tecnico

```text
Motor: Backend FastAPI
Eje: x
Perfil: 481 puntos
Area total: 95.2611
Crop usado: x 0, y 0, ancho 481, alto 76
Picos: 120 (25.0%), 283 (59.0%), 335 (69.8%), 360 (75.0%), 394 (82.1%), 425 (88.5%)
Minimos: 263 (54.8%), 299 (62.3%), 335 (69.8%), 394 (82.1%), 414 (86.3%)
```








--------------------------

## Resumen de calibracion

Base actual: 12 muestras reales.

Estado del set:

- Viable para una calibracion inicial `v3.3`.
- Todavia no alcanza como calibracion final cerrada.
- Muestras 01 y 06 son las mas estables del set.
- Muestras 05 y 07 deben quedar marcadas como `revisar` por desplazamiento fuerte Albumina / Alfa 1.
- Muestras 02, 03, 04, 05, 08, 09, 10, 11 y 12 muestran perdida de Gamma o redistribucion fuerte hacia Beta.
- El patron mas consistente sigue siendo el separador Beta 2 / Gamma demasiado a la derecha.

Lectura principal:

- El motor automatico no esta fallando tanto por area total, sino por posicion de separadores.
- El separador 5 es el problema mas consistente.
- La mediana del separador 5 del motor es 86.75%.
- La mediana del separador 5 calibrado es 79.20%.
- Offset mediano separador 5: -8.75 puntos porcentuales.
- Esto indica que Beta 2 esta absorbiendo area que corresponde a Gamma.

### Error promedio por fraccion

```text
Albumina: 4.33 puntos porcentuales
Alfa 1: 4.65 puntos porcentuales
Alfa 2: 1.85 puntos porcentuales
Beta 1: 5.28 puntos porcentuales
Beta 2: 8.81 puntos porcentuales
Gamma: 11.77 puntos porcentuales
```

### Desplazamiento promedio de separadores

Separadores:

1. Albumina / Alfa 1
2. Alfa 1 / Alfa 2
3. Alfa 2 / Beta 1
4. Beta 1 / Beta 2
5. Beta 2 / Gamma

```text
Separador 1: +2.20 promedio / +1.45 mediana
Separador 2: +0.12 promedio / +1.00 mediana
Separador 3: +0.07 promedio / -0.15 mediana
Separador 4: -2.87 promedio / -1.40 mediana
Separador 5: -7.85 promedio / -8.75 mediana
```

### Mediana de separadores calibrados

```text
Separador 1: 57.95%
Separador 2: 63.05%
Separador 3: 71.05%
Separador 4: 75.90%
Separador 5: 79.20%
```

### Mediana de separadores del motor

```text
Separador 1: 57.50%
Separador 2: 62.40%
Separador 3: 71.05%
Separador 4: 78.35%
Separador 5: 86.75%
```

### Decision tecnica

```text
Perfil recomendado: v3.3 calibracion inicial por reglas condicionales.
Regla Gamma colapsada: si Gamma <= 3% y Separador 5 >= 84%, corregir Beta 2 / Gamma hacia zona 79.5%.
Regla puente Beta/Gamma: si Beta 1 >= 12% y Gamma <= 3%, mover Separador 4 hacia 72.0% y Separador 5 hacia 75.5%.
Regla Alfa 1 inflada: si Alfa 1 >= 10%, Albumina <= 50% y Separador 1 <= 53%, mover separadores 1/2/3 hacia 60.0%, 64.0% y 72.0%.
Muestras descartadas: ninguna por ahora.
Muestras a revisar: Muestra 05 y Muestra 07.
Motivo: el set confirma una falla sistematica de segmentacion Beta 2 / Gamma.
```
