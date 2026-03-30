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

        total_percentage = round(
            sum(fraction.percentage for fraction in response.fractions.values()),
            2,
        )
        dominant = dominant_fraction(response)
        status = "OK"

        if dominant != case.dominant_fraction:
            status = "CHECK"
            failures += 1
        if abs(total_percentage - 100.0) > 0.75:
            status = "CHECK"
            failures += 1

        print(
            f"[{status}] {case.name}: "
            f"dominante={dominant}, "
            f"suma={total_percentage}%, "
            f"picos={response.detected_peaks}, "
            f"warning={response.warning or '-'}"
        )

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
