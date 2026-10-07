import unittest
from collections import Counter
from app.services.matrix_service import MatrixService, FACTORS


class TestMatrixService(unittest.TestCase):
    def setUp(self):
        self.meta_prompt = "masterpiece, best quality"
        self.physical_prompt = "1girl, silver hair, blue eyes"
        self.default_outfit = "school uniform, red tie, pleated skirt"
        self.alt_outfits = [
            {"id": 1, "prompt_tags": "casual hoodie, denim shorts"},
            {"id": 2, "prompt_tags": "swimsuit, bikini"},
        ]

    def test_generate_orthogonal_matrix_returns_20_slots(self):
        slots = MatrixService.generate_orthogonal_matrix(
            meta_prompt=self.meta_prompt,
            physical_prompt=self.physical_prompt,
            default_outfit_prompt=self.default_outfit,
            alt_outfits=self.alt_outfits,
            total_slots=20,
        )
        self.assertEqual(len(slots), 20)
        for idx, slot in enumerate(slots, start=1):
            self.assertEqual(slot["slot_index"], idx)
            self.assertIn("factors", slot)
            self.assertIn("raw_prompt", slot)
            self.assertIn("seed", slot)
            self.assertEqual(slot["status"], "APPROVED")
            self.assertTrue(len(slot["raw_prompt"]) > 0)

    def test_marginal_distributions(self):
        slots = MatrixService.generate_orthogonal_matrix(
            meta_prompt=self.meta_prompt,
            physical_prompt=self.physical_prompt,
            default_outfit_prompt=self.default_outfit,
            alt_outfits=self.alt_outfits,
            total_slots=20,
        )
        shots = Counter(s["factors"]["shot"] for s in slots)
        outfits = Counter(s["factors"]["outfit_type"] for s in slots)
        angles = Counter(s["factors"]["angle"] for s in slots)
        expressions = Counter(s["factors"]["expression"] for s in slots)
        poses = Counter(s["factors"]["pose"] for s in slots)

        # Shot distribution: Close-up 5, Bust shot 9, Full body 6
        self.assertEqual(shots["Close-up"], 5)
        self.assertEqual(shots["Bust shot"], 9)
        self.assertEqual(shots["Full body"], 6)

        # Outfit distribution: default 15, alt 5
        self.assertEqual(outfits["default"], 15)
        self.assertEqual(outfits["alt"], 5)

        # Angle: 4 levels * 5 = 20
        for angle in FACTORS["angle"]:
            self.assertEqual(angles[angle], 5)

        # Expression: 4 levels * 5 = 20
        for expr in FACTORS["expression"]:
            self.assertEqual(expressions[expr], 5)

        # Pose: 4 levels * 5 = 20
        for pose in FACTORS["pose"]:
            self.assertEqual(poses[pose], 5)

    def test_hard_constraint_close_up_pose_exclusion(self):
        slots = MatrixService.generate_orthogonal_matrix(
            meta_prompt=self.meta_prompt,
            physical_prompt=self.physical_prompt,
            default_outfit_prompt=self.default_outfit,
            alt_outfits=self.alt_outfits,
            total_slots=20,
        )
        for slot in slots:
            if slot["factors"]["shot"] == "Close-up":
                self.assertNotIn(
                    slot["factors"]["pose"],
                    ["Sitting", "Walking forward"],
                    f"Close-up slot {slot['slot_index']} has forbidden pose {slot['factors']['pose']}",
                )

    def test_exclusive_outfit_isolation_in_prompts(self):
        slots = MatrixService.generate_orthogonal_matrix(
            meta_prompt=self.meta_prompt,
            physical_prompt=self.physical_prompt,
            default_outfit_prompt=self.default_outfit,
            alt_outfits=self.alt_outfits,
            total_slots=20,
        )
        for slot in slots:
            raw = slot["raw_prompt"]
            if slot["factors"]["outfit_type"] == "default":
                self.assertIn("school uniform, red tie, pleated skirt", raw)
                self.assertNotIn("casual hoodie, denim shorts", raw)
                self.assertNotIn("swimsuit, bikini", raw)
            else:
                self.assertNotIn(
                    "school uniform, red tie, pleated skirt",
                    raw,
                    f"Alt slot {slot['slot_index']} must NOT contain default outfit",
                )
                has_alt = ("casual hoodie, denim shorts" in raw) or ("swimsuit, bikini" in raw)
                self.assertTrue(has_alt, f"Alt slot {slot['slot_index']} must contain alt outfit tags")

    def test_alt_outfits_round_robin_distribution(self):
        slots = MatrixService.generate_orthogonal_matrix(
            meta_prompt=self.meta_prompt,
            physical_prompt=self.physical_prompt,
            default_outfit_prompt=self.default_outfit,
            alt_outfits=self.alt_outfits,
            total_slots=20,
        )
        alt_slots = [s for s in slots if s["factors"]["outfit_type"] == "alt"]
        self.assertEqual(len(alt_slots), 5)

        hoodie_count = sum(1 for s in alt_slots if "casual hoodie, denim shorts" in s["raw_prompt"])
        bikini_count = sum(1 for s in alt_slots if "swimsuit, bikini" in s["raw_prompt"])

        self.assertEqual(hoodie_count, 3)
        self.assertEqual(bikini_count, 2)
