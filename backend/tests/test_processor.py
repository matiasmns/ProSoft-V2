from __future__ import annotations

import sys
import unittest
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


class ProcessorSyntheticCalibrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.calibration = get_calibration()
        cls.synthetic_case_map = {
            case.name: case
            for case in synthetic_cases(cls.calibration)
        }

    def process_case(self, name: str) -> ProcessAnalysisResponse:
        case = self.synthetic_case_map[name]
        signal = build_synthetic_signal(case, self.calibration)
        image = render_signal_to_image(signal)
        payload = encode_png(image)
        return process_electrophoresis_image(
            payload,
            total_concentration=case.total_concentration,
            calibration=self.calibration,
        )

    def process_case_with_seed(self, name: str, seed: int) -> ProcessAnalysisResponse:
        case = self.synthetic_case_map[name]
        signal = build_synthetic_signal(case, self.calibration)
        image = render_signal_to_image(signal, seed=seed)
        payload = encode_png(image)
        return process_electrophoresis_image(
            payload,
            total_concentration=case.total_concentration,
            calibration=self.calibration,
        )

    def test_normal_reference_keeps_albumin_dominant(self) -> None:
        response = self.process_case("normal_reference")
        self.assertEqual(response.calibration_profile, self.calibration.profile_name)
        self.assertEqual(response.calibration_version, self.calibration.profile_version)
        self.assertEqual(dominant_fraction(response), "albumina")
        self.assertEqual(len(response.profile_signal), response.profile_length)
        self.assertGreater(len(response.profile), 0)

        total_percentage = sum(
            fraction.percentage
            for fraction in response.fractions.values()
        )
        self.assertAlmostEqual(total_percentage, 100.0, delta=0.75)
        self.assertGreater(response.fractions["albumina"].percentage, 35.0)

    def test_gamma_spike_reference_detects_gamma_dominance(self) -> None:
        response = self.process_case("gamma_spike_reference")
        self.assertEqual(dominant_fraction(response), "gamma")
        self.assertGreater(response.fractions["gamma"].percentage, 25.0)
        self.assertGreaterEqual(response.detected_peaks, 4)

    def test_beta_gamma_bridge_keeps_non_zero_distribution(self) -> None:
        response = self.process_case("beta_gamma_bridge_reference")
        self.assertEqual(dominant_fraction(response), "albumina")
        self.assertGreater(response.fractions["beta_1"].percentage, 8.0)
        self.assertGreater(response.fractions["beta_2"].percentage, 8.0)
        self.assertGreater(response.fractions["gamma"].percentage, 10.0)
        self.assertTrue(all(fraction.percentage > 0.0 for fraction in response.fractions.values()))

    def test_gamma_spike_reference_is_stable_across_render_noise(self) -> None:
        responses = [
            self.process_case_with_seed("gamma_spike_reference", seed)
            for seed in range(1, 6)
        ]
        self.assertTrue(all(dominant_fraction(response) == "gamma" for response in responses))

        gamma_values = [response.fractions["gamma"].percentage for response in responses]
        albumin_values = [response.fractions["albumina"].percentage for response in responses]
        self.assertLess(max(gamma_values) - min(gamma_values), 3.0)
        self.assertLess(max(albumin_values) - min(albumin_values), 2.0)

    def test_beta_gamma_bridge_reference_is_stable_across_render_noise(self) -> None:
        responses = [
            self.process_case_with_seed("beta_gamma_bridge_reference", seed)
            for seed in range(1, 6)
        ]
        self.assertTrue(all(dominant_fraction(response) == "albumina" for response in responses))

        beta1_values = [response.fractions["beta_1"].percentage for response in responses]
        beta2_values = [response.fractions["beta_2"].percentage for response in responses]
        gamma_values = [response.fractions["gamma"].percentage for response in responses]
        self.assertLess(max(beta1_values) - min(beta1_values), 1.0)
        self.assertLess(max(beta2_values) - min(beta2_values), 1.0)
        self.assertLess(max(gamma_values) - min(gamma_values), 1.0)
