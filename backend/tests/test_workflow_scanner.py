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
