import unittest
from app.services.workflow_scanner import scan_workflow

class DummyMappingMaster:
    def __init__(self, id: int, role: str, expected_class_types: str, param_name: str, title_patterns: str):
        self.id = id
        self.role = role
        self.expected_class_types = expected_class_types
        self.param_name = param_name
        self.title_patterns = title_patterns

class TestWorkflowScanner(unittest.TestCase):
    def test_comma_separated_alias_param_match(self):
        # Master expects either 'seed' or 'noise_seed' as parameter name, class type is 'KSampler'
        master = DummyMappingMaster(
            id=1,
            role="seed_role",
            expected_class_types='["KSampler"]',
            param_name="seed, noise_seed",
            title_patterns='[]'
        )

        # Workflow node has KSampler with 'noise_seed' key
        workflow_json = {
            "10": {
                "class_type": "KSampler",
                "inputs": {
                    "noise_seed": 12345
                },
                "_meta": {
                    "title": "My KSampler Node"
                }
            }
        }

        result = scan_workflow(workflow_json, [master])
        self.assertEqual(len(result["matched"]), 1)
        self.assertEqual(result["matched"][0]["node_id"], "10")
        self.assertEqual(result["matched"][0]["status"], "ok")
        self.assertEqual(len(result["warnings"]), 0)

    def test_smart_perfect_match_resolves_duplicate(self):
        # Master expects 'KSampler' and title_pattern 'positive'
        master = DummyMappingMaster(
            id=1,
            role="sampler_role",
            expected_class_types='["KSampler"]',
            param_name="seed",
            title_patterns='["positive"]'
        )

        # Workflow has two KSampler nodes, but only one is titled 'positive'
        workflow_json = {
            "10": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 123
                },
                "_meta": {
                    "title": "positive"
                }
            },
            "11": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 456
                },
                "_meta": {
                    "title": "negative"
                }
            }
        }

        result = scan_workflow(workflow_json, [master])
        self.assertEqual(len(result["matched"]), 1)
        # Should smart match to '10' because title matches 'positive'
        self.assertEqual(result["matched"][0]["node_id"], "10")
        # Should NOT have duplicate warning
        self.assertEqual(len(result["warnings"]), 0)
        # Should include both 10 and 11 in candidates list
        self.assertIn("10", result["matched"][0]["node_ids"])
        self.assertIn("11", result["matched"][0]["node_ids"])

    def test_no_perfect_match_fallback_to_duplicate_warning(self):
        master = DummyMappingMaster(
            id=1,
            role="sampler_role",
            expected_class_types='["KSampler"]',
            param_name="seed",
            title_patterns='["some_other_title"]'
        )

        workflow_json = {
            "10": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 123
                },
                "_meta": {
                    "title": "positive"
                }
            },
            "11": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 456
                },
                "_meta": {
                    "title": "negative"
                }
            }
        }

        result = scan_workflow(workflow_json, [master])
        self.assertEqual(len(result["matched"]), 1)
        # Defaults to the first candidate (10)
        self.assertEqual(result["matched"][0]["node_id"], "10")
        # Should produce a duplicated warning
        self.assertEqual(len(result["warnings"]), 1)
        self.assertEqual(result["warnings"][0]["status"], "duplicated")
        self.assertEqual(set(result["warnings"][0]["node_ids"]), {"10", "11"})

    def test_conflict_fallback_to_first_perfect_match(self):
        master = DummyMappingMaster(
            id=1,
            role="sampler_role",
            expected_class_types='["KSampler"]',
            param_name="seed",
            title_patterns='["positive"]'
        )
        workflow_json = {
            "10": {
                "class_type": "KSampler",
                "inputs": {"seed": 123},
                "_meta": {"title": "negative"}
            },
            "11": {
                "class_type": "KSampler",
                "inputs": {"seed": 456},
                "_meta": {"title": "positive"}
            },
            "12": {
                "class_type": "KSampler",
                "inputs": {"seed": 789},
                "_meta": {"title": "positive"}
            }
        }
        result = scan_workflow(workflow_json, [master])
        self.assertEqual(len(result["matched"]), 1)
        self.assertEqual(result["matched"][0]["node_id"], "11")
        self.assertEqual(len(result["warnings"]), 1)
        self.assertEqual(result["warnings"][0]["status"], "duplicated")
        self.assertEqual(set(result["warnings"][0]["node_ids"]), {"10", "11", "12"})

    def test_empty_expected_class_types_matches_by_title_only(self):
        master = DummyMappingMaster(
            id=1,
            role="custom_role",
            expected_class_types='[]',
            param_name="",
            title_patterns='["my_node_title"]'
        )
        workflow_json = {
            "10": {
                "class_type": "SomeClass",
                "_meta": {"title": "other_title"}
            },
            "11": {
                "class_type": "AnotherClass",
                "_meta": {"title": "my_node_title"}
            }
        }
        result = scan_workflow(workflow_json, [master])
        self.assertEqual(len(result["matched"]), 1)
        self.assertEqual(result["matched"][0]["node_id"], "11")
        self.assertEqual(len(result["warnings"]), 0)

    def test_detect_checkpoint_names(self):
        from app.services.workflow_scanner import detect_checkpoint_names
        workflow_json = {
            "4": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {
                    "ckpt_name": "anime_style_v3.safetensors"
                }
            },
            "5": {
                "class_type": "SomeOtherNode",
                "inputs": {
                    "ckpt_name": "ignore_me.safetensors"
                }
            }
        }
        names = detect_checkpoint_names(workflow_json)
        self.assertIn("anime_style_v3.safetensors", names)
        self.assertIn("ignore_me.safetensors", names)

    def test_estimate_base_model_from_checkpoints(self):
        from app.services.workflow_scanner import estimate_base_model_from_checkpoints
        
        class DummyMapping:
            def __init__(self, checkpoint_name, base_model_id):
                self.checkpoint_name = checkpoint_name
                self.base_model_id = base_model_id

        mappings = [
            DummyMapping("anime_style_v3.safetensors", 1),
            DummyMapping("noob_v1", 2),
        ]

        # 1. Exact match
        res = estimate_base_model_from_checkpoints(["anime_style_v3.safetensors"], mappings)
        self.assertEqual(res, 1)

        # 2. Path exact match (base filename)
        res = estimate_base_model_from_checkpoints(["path\\to\\anime_style_v3.safetensors"], mappings)
        self.assertEqual(res, 1)

        # 3. Partial match (mapping name is substring of filename)
        res = estimate_base_model_from_checkpoints(["noob_v1_alpha.safetensors"], mappings)
        self.assertEqual(res, 2)

        # 4. Partial match (filename substring of mapping)
        res = estimate_base_model_from_checkpoints(["noob"], mappings)
        self.assertEqual(res, 2)

        # 5. Unknown
        res = estimate_base_model_from_checkpoints(["unknown_model_xyz.safetensors"], mappings)
        self.assertEqual(res, None)
