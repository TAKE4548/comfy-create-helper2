import unittest
from typing import Optional
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

    def test_scan_workflow_variants_stage_keywords_matching(self):
        from app.services.workflow_scanner import scan_workflow_variants

        class DummyStage:
            def __init__(self, id: int, key: str, suffix: str, search_keywords: str):
                self.id = id
                self.key = key
                self.suffix = suffix
                self.search_keywords = search_keywords

        class DummyMaster:
            def __init__(self, id: int, base_key: str, expected_class_types: str, param_name: str, base_title_patterns: str):
                self.id = id
                self.base_key = base_key
                self.expected_class_types = expected_class_types
                self.param_name = param_name
                self.base_title_patterns = base_title_patterns

        class DummyVariant:
            def __init__(self, id: int, master: DummyMaster, stage: DummyStage, custom_role_override: Optional[str] = None, extra_title_patterns: str = "[]", is_enabled: bool = True):
                self.id = id
                self.master_id = master.id
                self.stage_id = stage.id
                self.master = master
                self.stage = stage
                self.custom_role_override = custom_role_override
                self.extra_title_patterns = extra_title_patterns
                self.is_enabled = is_enabled

            @property
            def computed_role(self) -> str:
                if self.custom_role_override:
                    return self.custom_role_override
                return f"{self.master.base_key}{self.stage.suffix}"

        stage_main = DummyStage(1, "main", "", "[]")
        stage_rough = DummyStage(2, "rough", "_rough", '["rough", "draft"]')
        stage_detail = DummyStage(3, "detail", "_detail", '["detail"]')

        master_steps = DummyMaster(1, "steps", '["KSampler"]', "steps", '["KSampler"]')

        var_main = DummyVariant(1, master_steps, stage_main)
        var_rough = DummyVariant(2, master_steps, stage_rough)
        var_detail = DummyVariant(3, master_steps, stage_detail)

        workflow_json = {
            "10": {
                "class_type": "KSampler",
                "inputs": {"steps": 10},
                "_meta": {"title": "KSampler (Rough Pass)"}
            },
            "20": {
                "class_type": "KSampler",
                "inputs": {"steps": 30},
                "_meta": {"title": "KSampler (Detail Stage)"}
            },
            "30": {
                "class_type": "KSampler",
                "inputs": {"steps": 20},
                "_meta": {"title": "KSampler"}
            }
        }

        res = scan_workflow_variants(workflow_json, [var_main, var_rough, var_detail])
        self.assertEqual(len(res["matched"]), 3)
        self.assertEqual(len(res["warnings"]), 0)

        match_by_role = {m["role"]: m["node_id"] for m in res["matched"]}
        self.assertEqual(match_by_role["steps"], "30")
        self.assertEqual(match_by_role["steps_rough"], "10")
        self.assertEqual(match_by_role["steps_detail"], "20")

    def test_scan_workflow_variants_unmatched_stage_not_found(self):
        from app.services.workflow_scanner import scan_workflow_variants

        class DummyStage:
            def __init__(self, id: int, key: str, suffix: str, search_keywords: str):
                self.id = id
                self.key = key
                self.suffix = suffix
                self.search_keywords = search_keywords

        class DummyMaster:
            def __init__(self, id: int, base_key: str, expected_class_types: str, param_name: str):
                self.id = id
                self.base_key = base_key
                self.expected_class_types = expected_class_types
                self.param_name = param_name
                self.base_title_patterns = '["KSampler"]'

        class DummyVariant:
            def __init__(self, id: int, master: DummyMaster, stage: DummyStage):
                self.id = id
                self.master_id = master.id
                self.stage_id = stage.id
                self.master = master
                self.stage = stage
                self.custom_role_override = None
                self.extra_title_patterns = "[]"
                self.is_enabled = True

            @property
            def computed_role(self) -> str:
                return f"{self.master.base_key}{self.stage.suffix}"

        stage_main = DummyStage(1, "main", "", "[]")
        stage_rough = DummyStage(2, "rough", "_rough", '["rough"]')
        master = DummyMaster(1, "steps", '["KSampler"]', "steps")

        var_main = DummyVariant(1, master, stage_main)
        var_rough = DummyVariant(2, master, stage_rough)

        # 1-stage workflow with no rough node
        workflow_json = {
            "30": {
                "class_type": "KSampler",
                "inputs": {"steps": 20},
                "_meta": {"title": "KSampler"}
            }
        }

        res = scan_workflow_variants(workflow_json, [var_main, var_rough])
        self.assertEqual(len(res["matched"]), 1)
        self.assertEqual(res["matched"][0]["role"], "steps")
        self.assertEqual(res["matched"][0]["node_id"], "30")

        self.assertEqual(len(res["warnings"]), 1)
        self.assertEqual(res["warnings"][0]["role"], "steps_rough")
        self.assertEqual(res["warnings"][0]["status"], "not_found")

    def test_scan_workflow_variants_extra_title_patterns_and_disabled(self):
        from app.services.workflow_scanner import scan_workflow_variants

        class DummyStage:
            def __init__(self, id: int, key: str, suffix: str, search_keywords: str):
                self.id = id
                self.key = key
                self.suffix = suffix
                self.search_keywords = search_keywords

        class DummyMaster:
            def __init__(self, id: int, base_key: str, expected_class_types: str, param_name: str):
                self.id = id
                self.base_key = base_key
                self.expected_class_types = expected_class_types
                self.param_name = param_name
                self.base_title_patterns = '["KSampler"]'

        class DummyVariant:
            def __init__(self, id: int, master: DummyMaster, stage: DummyStage, extra_title_patterns: str = "[]", is_enabled: bool = True):
                self.id = id
                self.master_id = master.id
                self.stage_id = stage.id
                self.master = master
                self.stage = stage
                self.custom_role_override = None
                self.extra_title_patterns = extra_title_patterns
                self.is_enabled = is_enabled

            @property
            def computed_role(self) -> str:
                return f"{self.master.base_key}{self.stage.suffix}"

        stage_main = DummyStage(1, "main", "", "[]")
        master = DummyMaster(1, "steps", '["KSampler"]', "steps")

        var1 = DummyVariant(1, master, stage_main, extra_title_patterns='["Custom Special Sampler"]', is_enabled=True)
        var_disabled = DummyVariant(2, master, stage_main, is_enabled=False)

        workflow_json = {
            "50": {
                "class_type": "KSampler",
                "inputs": {"steps": 25},
                "_meta": {"title": "Custom Special Sampler"}
            }
        }

        res = scan_workflow_variants(workflow_json, [var1, var_disabled])
        self.assertEqual(len(res["matched"]), 1)
        self.assertEqual(res["matched"][0]["node_id"], "50")
        self.assertEqual(len(res["warnings"]), 0)

