drop view if exists prosoft_project.reference_calibration;

create view prosoft_project.reference_calibration
with (security_invoker = true)
as
select
  analisis.id as analisis_id,
  analisis.paciente_id,
  analisis.numero_placa,
  analisis.numero_muestra,
  analisis.numero_paciente,
  analisis.estado,
  analisis.fecha_hora_analisis,
  analisis.updated_at,
  pacientes.paciente_codigo,
  pacientes.dni,
  pacientes.nombre,
  pacientes.apellido,
  analisis.resultado_crudo -> 'reference_calibration' ->> 'version' as version,
  analisis.resultado_crudo -> 'reference_calibration' ->> 'source' as source,
  analisis.resultado_crudo -> 'reference_calibration' ->> 'pattern' as pattern,
  analisis.resultado_crudo -> 'reference_calibration' ->> 'processor_source' as processor_source,
  analisis.resultado_crudo -> 'reference_calibration' ->> 'algorithm_version' as algorithm_version,
  analisis.resultado_crudo -> 'reference_calibration' ->> 'calibration_profile' as calibration_profile,
  analisis.resultado_crudo -> 'reference_calibration' ->> 'calibration_version' as calibration_version,
  analisis.resultado_crudo -> 'reference_calibration' -> 'targets' as targets,
  analisis.resultado_crudo -> 'reference_calibration' -> 'applied_ranges' as applied_ranges,
  analisis.resultado_crudo -> 'reference_calibration' -> 'processor_ranges' as processor_ranges,
  analisis.resultado_crudo -> 'reference_calibration' -> 'crop_used' as crop_used,
  analisis.resultado_crudo -> 'reference_calibration' -> 'peaks' as peaks,
  analisis.resultado_crudo -> 'reference_calibration' -> 'valleys' as valleys,
  analisis.resultado_crudo -> 'reference_calibration' ->> 'axis' as axis,
  nullif(analisis.resultado_crudo -> 'reference_calibration' ->> 'profile_length', '')::integer as profile_length,
  nullif(analisis.resultado_crudo -> 'reference_calibration' ->> 'total_area', '')::numeric as total_area,
  nullif(analisis.resultado_crudo -> 'reference_calibration' ->> 'total_target', '')::numeric as total_target,
  (analisis.resultado_crudo -> 'reference_calibration' ->> 'updated_at')::timestamptz as reference_updated_at
from prosoft_project.analisis_electroforesis analisis
join prosoft_project.pacientes pacientes
  on pacientes.id = analisis.paciente_id
where analisis.resultado_crudo ? 'reference_calibration';

grant select on prosoft_project.reference_calibration to authenticated;
