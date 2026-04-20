from __future__ import annotations

import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.calibration import get_calibration
from app.processor import process_electrophoresis_image
from app.synthetic_cases import build_synthetic_signal, encode_png, render_signal_to_image, synthetic_cases
from app.schemas import FractionKey, ProcessAnalysisResponse


def dominant_fraction(response: ProcessAnalysisResponse) -> FractionKey:
    return max(
        response.fractions.items(),
        key=lambda item: item[1].percentage,
    )[0]


def validate_case(case_name: str, response: ProcessAnalysisResponse, expected_dominant: FractionKey) -> list[str]:
    errors: list[str] = []
    total_percentage = round(
        sum(fraction.percentage for fraction in response.fractions.values()),
        2,
    )
    dominant = dominant_fraction(response)

    if dominant != expected_dominant:
        errors.append(f"dominante esperado={expected_dominant}, obtenido={dominant}")
    if abs(total_percentage - 100.0) > 0.75:
        errors.append(f"suma de porcentajes fuera de tolerancia: {total_percentage}%")

    if case_name == "normal_reference" and response.fractions["albumina"].percentage <= 35.0:
        errors.append("albumina no queda dominante en referencia normal")
    if case_name == "gamma_spike_reference":
        if response.fractions["gamma"].percentage <= 25.0:
            errors.append("gamma spike no supera 25%")
        if response.detected_peaks < 4:
            errors.append("gamma spike detecto menos de 4 picos")
    if case_name == "beta_gamma_bridge_reference":
        if response.fractions["beta_1"].percentage <= 8.0:
            errors.append("beta_1 colapsa por debajo de 8%")
        if response.fractions["beta_2"].percentage <= 8.0:
            errors.append("beta_2 colapsa por debajo de 8%")
        if response.fractions["gamma"].percentage <= 10.0:
            errors.append("gamma colapsa por debajo de 10%")
        if any(fraction.percentage <= 0.0 for fraction in response.fractions.values()):
            errors.append("alguna fraccion queda en cero")

    return errors


def main() -> int:
    calibration = get_calibration()
    failures = 0

    print(
        f"Perfil activo: {calibration.profile_name} "
        f"({calibration.profile_version})"
    )

    for case in synthetic_cases(calibration):
        signal = build_synthetic_signal(case, calibration)
        image = render_signal_to_image(signal)
        payload = encode_png(image)
        response = process_electrophoresis_image(
            payload,
            total_concentration=case.total_concentration,
            calibration=calibration,
        )

        dominant = dominant_fraction(response)
        total_percentage = round(sum(fraction.percentage for fraction in response.fractions.values()), 2)
        case_errors = validate_case(case.name, response, case.dominant_fraction)
        status = "CHECK" if case_errors else "OK"
        failures += len(case_errors)

        print(
            f"[{status}] {case.name}: "
            f"dominante={dominant}, "
            f"suma={total_percentage}%, "
            f"picos={response.detected_peaks}, "
            f"warning={response.warning or '-'}"
        )
        for error in case_errors:
            print(f"  - {error}")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
