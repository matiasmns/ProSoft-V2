# Diagnóstico y Propuesta de Mejora: Motor Analítico ElectroLab Analytics

Este documento detalla los puntos críticos identificados en el motor actual y las estrategias sugeridas para la modernización del análisis de electroforesis en el Instituto Fares Taie.

## 1. Diagnóstico del motor actual (`processor.py`)

Se han identificado limitaciones en la estrategia de parámetros fijos frente a la variabilidad biológica real:

* **Umbrales Rígidos:** El código depende de constantes como `EARLY_ALBUMIN_PEAK_RATIO = 0.24` o rangos fijos para decidir qué ventanas de fracciones usar. En la práctica clínica, variaciones en la corrida electroforética pueden desplazar estos porcentajes, provocando que el software pierda la referencia.
* **Dependencia de la Albúmina:** La lógica condiciona la detección de globulinas a la posición de la Albúmina. En casos de hipoalbuminemia severa, el algoritmo puede fallar en cascada al no encontrar el punto de referencia esperado.
* **El Fenómeno del "Puente Beta-Gamma":** Existe una regla heurística para el `BETA1_BRIDGE_PERCENTAGE`. Sin embargo, en patologías como la cirrosis, el valle entre Beta y Gamma desaparece. El código actual intenta forzar límites en zonas donde la curva es plana o ascendente, generando errores en el cálculo de área.

## 2. Nuevas herramientas para la calibración

Para automatizar la calibración y aumentar la robustez del densitograma, se recomienda integrar librerías estándar de procesamiento de señales científicas:

* **LMFIT (Non-Linear Least-Squares Minimization):** * **Función:** Permite realizar *Curve Fitting* avanzado.
    * **Aplicación:** Definir un modelo compuesto por 6 curvas Gaussianas (una por proteína) que se "ajusten" a los datos reales. Esto elimina la necesidad de ventanas fijas en el JSON, ya que el modelo se adapta al ancho de cada fracción.
* **Optuna (Hyperparameter Optimization):**
    * **Función:** Automatiza la búsqueda de parámetros ideales.
    * **Aplicación:** Utilizar los casos reales y sintéticos para que Optuna encuentre los valores óptimos de `peak_prominence` o `smoothing_sigma_divisor` que minimicen el error frente a la validación experta.

## 3. Recomendación de Arquitectura: Deconvolución

Actualmente el sistema utiliza `np.trapezoid` para calcular el área entre dos puntos. Dado que las proteínas se solapan (overlap), la integración simple es menos precisa que el modelado de picos:

1. **Modelado Gaussiano:** Cambiar la búsqueda de valles por un ajuste donde el área de cada campana de Gauss represente el porcentaje exacto de la proteína, incluso si están "pisadas" por otra.
2. **Detección Dinámica de Valles:** En lugar de buscar en porcentajes fijos de la curva, el motor debe buscar el mínimo local real utilizando la segunda derivada de la señal.
3. **Alertas Inteligentes:** El sistema debe detectar cuando la derivada no llega a cero en la zona Beta-Gamma para informar que el límite es una "proyección" técnica y no un valle real.

## 4. Continuidad Operativa y Familiaridad

Para asegurar la aceptación en el laboratorio, el software debe contemplar funciones del sistema anterior (PHORESIS):

* **Ajuste Manual de Albúmina:** Se debe permitir un factor de escala manual (`+Album / -Album`) si el bioquímico decide que el algoritmo la subestimó.
* **Mismo Workflow Bioquímico:** Mantener la lógica de las 6 fracciones pero sobre una arquitectura moderna compatible con Windows 10/11, eliminando los riesgos de seguridad del software heredado.

---
*Documento generado para el equipo de desarrollo de ElectroLab Analytics - 2026.*