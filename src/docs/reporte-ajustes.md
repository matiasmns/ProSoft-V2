# Cambios de Parte de Claude Code                                            
  processor.py — normalize_signal (líneas 106-111):                                                                                                                                                          

  # Antes (baseline constante global):
  baseline = float(np.percentile(signal, 5))
  corrected = np.clip(signal - baseline, 0.0, None)

  # Ahora (baseline adaptativo local):
  window = max(calibration.baseline_window_min, signal.size // calibration.baseline_window_divisor)
  if window % 2 == 0:
      window += 1
  rolling_min = minimum_filter1d(signal, size=window)   # mínimo local
  baseline = gaussian_filter1d(rolling_min, sigma=window / 2.0)  # suavizado
  corrected = np.clip(signal - baseline, 0.0, None)

  El minimum_filter1d captura el piso local del gel en cada zona. El gaussian_filter1d sobre ese mínimo evita que el baseline tenga bordes abruptos entre ventanas. Con baseline_window_divisor=18 en el     
  JSON, para una señal de 500 puntos la ventana es ~28 px — suficiente para capturar variaciones del fondo sin "morder" los picos proteicos.

  El segundo np.clip(smooth - percentile(smooth, 2)) sigue actuando como red de seguridad para el residual post-suavizado. La versión del algoritmo pasó a v3.4-adaptive-baseline.