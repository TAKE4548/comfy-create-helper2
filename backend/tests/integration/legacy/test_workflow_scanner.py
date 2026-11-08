import unittest
from typing import Optional
from app.services.workflow_scanner import scan_workflow


class _Entry:
    def __init__(self, class_type: str, param_name: str, priority: int = 1):
        self.class_type = class_type
        self.param_name = param_name
        self.priority = priority


class _RuleSet:
    def __init__(self, entries: list):
        self.entries = entries


class _Pattern:
    def __init__(self, pattern: str, match_type: str = "contains", priority: int = 1):
        self.pattern = pattern
        self.match_type = match_type
        self.priority = priority


class _Selector:
    def __init__(self, patterns: list):
        self.patterns = patterns


class _Stage:
    def __init__(self, id: int, key: str, suffix: str = "", sort_order: int = 0, search_keywords: Optional[str] = None):
        self.id = id
        self.key = key
        self.suffix = suffix
        self.sort_order = sort_order
        self.search_keywords = search_keywords


class _Master:
    def __init__(self, id: int, base_key: str = "steps", **legacy):
        self.id = id
        self.base_key = base_key
        for k, v in legacy.items():
            setattr(self, k, v)


class _Variant:
    def __init__(
        self,
        id: int,
        master: _Master,
        stage: _Stage,
        entries: Optional[list] = None,
        patterns: Optional[list] = None,
        is_enabled: bool = True,
        sort_order: int = 0,
        **legacy,
    ):
        self.id = id
        self.master_id = master.id
        self.stage_id = stage.id
        self.master = master
        self.stage = stage
        self.role = f"{master.base_key}{stage.suffix}"
        self.binding_rule_set = _RuleSet(entries) if entries is not None else None
        self.node_selector = _Selector(patterns) if patterns else None
        self.is_enabled = is_enabled
        self.sort_order = sort_order
        for k, v in legacy.items():
            setattr(self, k, v)


def _node(title: str, inputs: dict, class_type: str = "KSampler") -> dict:
    return {"class_type": class_type, "inputs": inputs, "_meta": {"title": title}}


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

        entries = [_Entry("KSampler", "steps")]
        stage_main = _Stage(1, "main", "", 0)
        stage_rough = _Stage(2, "rough", "_rough", 1)
        stage_detail = _Stage(3, "detail", "_detail", 2)
        master = _Master(1, "steps")

        var_main = _Variant(1, master, stage_main, entries)
        var_rough = _Variant(2, master, stage_rough, entries, [_Pattern("rough"), _Pattern("draft")])
        var_detail = _Variant(3, master, stage_detail, entries, [_Pattern("detail")])

        workflow_json = {
            "10": _node("KSampler (Rough Pass)", {"steps": 10}),
            "20": _node("KSampler (Detail Stage)", {"steps": 30}),
            "30": _node("KSampler", {"steps": 20}),
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

        entries = [_Entry("KSampler", "steps")]
        master = _Master(1, "steps")
        var_main = _Variant(1, master, _Stage(1, "main", "", 0), entries)
        var_rough = _Variant(2, master, _Stage(2, "rough", "_rough", 1), entries, [_Pattern("rough")])

        # 1-stage workflow with no rough node
        workflow_json = {"30": _node("KSampler", {"steps": 20})}

        res = scan_workflow_variants(workflow_json, [var_main, var_rough])
        self.assertEqual(len(res["matched"]), 1)
        self.assertEqual(res["matched"][0]["role"], "steps")
        self.assertEqual(res["matched"][0]["node_id"], "30")

        self.assertEqual(len(res["warnings"]), 1)
        self.assertEqual(res["warnings"][0]["role"], "steps_rough")
        self.assertEqual(res["warnings"][0]["status"], "not_found")

    def test_scan_workflow_variants_extra_title_patterns_and_disabled(self):
        from app.services.workflow_scanner import scan_workflow_variants

        entries = [_Entry("KSampler", "steps")]
        stage_main = _Stage(1, "main", "", 0)
        master = _Master(1, "steps")

        var1 = _Variant(1, master, stage_main, entries, [_Pattern("Custom Special Sampler", "exact")])
        var_disabled = _Variant(2, master, stage_main, entries, is_enabled=False)

        workflow_json = {"50": _node("Custom Special Sampler", {"steps": 25})}

        res = scan_workflow_variants(workflow_json, [var1, var_disabled])
        self.assertEqual(len(res["matched"]), 1)
        self.assertEqual(res["matched"][0]["node_id"], "50")
        self.assertEqual(len(res["warnings"]), 0)

    def test_req417_ac2_lexicographical_scan_stages_and_input_name(self):
        """[REQ-417/AC-2] Lexicographical scan stages 1-4, priorities, node_id order, and input_name."""
        from app.services.workflow_scanner import scan_workflow_variants

        class DummyEntry:
            def __init__(self, class_type: str, param_name: str, priority: int = 1):
                self.class_type = class_type
                self.param_name = param_name
                self.priority = priority

        class DummyRuleSet:
            def __init__(self, id: int, name: str, entries: list[DummyEntry]):
                self.id = id
                self.name = name
                self.entries = entries

        class DummyPattern:
            def __init__(self, pattern: str, match_type: str = "contains", priority: int = 1):
                self.pattern = pattern
                self.match_type = match_type
                self.priority = priority

        class DummySelector:
            def __init__(self, id: int, name: str, patterns: list[DummyPattern]):
                self.id = id
                self.name = name
                self.patterns = patterns

        class DummyStage:
            def __init__(self, id: int, key: str, suffix: str = "", sort_order: int = 0):
                self.id = id
                self.key = key
                self.suffix = suffix
                self.sort_order = sort_order

        class DummyMaster:
            def __init__(self, id: int, base_key: str):
                self.id = id
                self.base_key = base_key

        class DummyVariant:
            def __init__(
                self,
                id: int,
                master: DummyMaster,
                stage: DummyStage,
                binding_rule_set: DummyRuleSet,
                node_selector: Optional[DummySelector] = None,
                role: str = "",
            ):
                self.id = id
                self.master_id = master.id
                self.stage_id = stage.id
                self.master = master
                self.stage = stage
                self.binding_rule_set = binding_rule_set
                self.node_selector = node_selector
                self.role = role or f"{master.base_key}{stage.suffix}"
                self.is_enabled = True

            @property
            def computed_role(self) -> str:
                return self.role

        master = DummyMaster(1, "steps")
        stage = DummyStage(1, "main", "", sort_order=1)
        rule_set = DummyRuleSet(
            1,
            "sampler_steps",
            [
                DummyEntry("KSampler", "steps", priority=1),
                DummyEntry("KSamplerAdvanced", "steps", priority=2),
            ],
        )
        selector = DummySelector(
            1,
            "main_selector",
            [
                DummyPattern("Main Sampler", match_type="exact", priority=1),
                DummyPattern("Sampler", match_type="contains", priority=1),
            ],
        )
        var = DummyVariant(1, master, stage, rule_set, selector)

        # 1. Test Stage 1 (exact) vs Stage 2 (contains) vs Stage 3 (no match)
        workflow_json = {
            "100": {
                "class_type": "KSampler",
                "inputs": {"steps": 10},
                "_meta": {"title": "Sampler Extra"},  # Stage 2 (contains)
            },
            "200": {
                "class_type": "KSampler",
                "inputs": {"steps": 20},
                "_meta": {"title": "Main Sampler"},  # Stage 1 (exact)
            },
            "300": {
                "class_type": "KSampler",
                "inputs": {"steps": 30},
                "_meta": {"title": "Unrelated Title"},  # Stage 3 (no pattern match)
            },
            "400": {
                "class_type": "OtherClass",
                "inputs": {"steps": 40},
                "_meta": {"title": "Main Sampler"},  # Disqualified: class_type mismatch
            },
            "500": {
                "class_type": "KSampler",
                "inputs": {"unrelated_param": 50},
                "_meta": {"title": "Main Sampler"},  # Disqualified: param_name mismatch
            },
        }

        res = scan_workflow_variants(workflow_json, [var])
        self.assertEqual(len(res["matched"]), 1)
        # Stage 1 (Node 200) must win over Stage 2 (Node 100) and Stage 3 (Node 300)
        self.assertEqual(res["matched"][0]["node_id"], "200")
        self.assertEqual(res["matched"][0]["input_name"], "steps")
        self.assertEqual(res["matched"][0]["role"], "steps")
        self.assertEqual(len(res["warnings"]), 0)

        # 2. Test Entry priority: Node with entry priority 1 wins over priority 2
        workflow_prio = {
            "10": {
                "class_type": "KSamplerAdvanced",  # priority 2
                "inputs": {"steps": 15},
                "_meta": {"title": "Main Sampler"},
            },
            "20": {
                "class_type": "KSampler",  # priority 1
                "inputs": {"steps": 25},
                "_meta": {"title": "Main Sampler"},
            },
        }
        res_prio = scan_workflow_variants(workflow_prio, [var])
        self.assertEqual(res_prio["matched"][0]["node_id"], "20")

        # 3. Test Numeric Node ID order when stage & priorities are equal
        rule_set_simple = DummyRuleSet(2, "simple", [DummyEntry("KSampler", "steps", 1)])
        var_no_sel = DummyVariant(2, master, stage, rule_set_simple, node_selector=None)
        workflow_dup = {
            "12": {
                "class_type": "KSampler",
                "inputs": {"steps": 10},
                "_meta": {"title": "Regular 12"},
            },
            "5": {
                "class_type": "KSampler",
                "inputs": {"steps": 10},
                "_meta": {"title": "Regular 5"},
            },
        }
        res_dup = scan_workflow_variants(workflow_dup, [var_no_sel])
        self.assertEqual(len(res_dup["matched"]), 1)
        # 5 < 12 numerically
        self.assertEqual(res_dup["matched"][0]["node_id"], "5")
        self.assertEqual(res_dup["matched"][0]["input_name"], "steps")
        # Duplicated warning must be emitted because multiple candidates in Stage 3
        self.assertEqual(len(res_dup["warnings"]), 1)
        self.assertEqual(res_dup["warnings"][0]["status"], "duplicated")
        self.assertIn("5", res_dup["warnings"][0]["node_ids"])
        self.assertIn("12", res_dup["warnings"][0]["node_ids"])

    def test_req417_ac3_multi_stage_conflict_specificity_resolution(self):
        """[REQ-417/AC-3] Multi-stage conflict resolution by specificity (exact > contains, longer pattern) and confirmed pair elimination."""
        from app.services.workflow_scanner import scan_workflow_variants

        class DummyEntry:
            def __init__(self, class_type: str, param_name: str, priority: int = 1):
                self.class_type = class_type
                self.param_name = param_name
                self.priority = priority

        class DummyRuleSet:
            def __init__(self, id: int, name: str, entries: list[DummyEntry]):
                self.id = id
                self.name = name
                self.entries = entries

        class DummyPattern:
            def __init__(self, pattern: str, match_type: str = "contains", priority: int = 1):
                self.pattern = pattern
                self.match_type = match_type
                self.priority = priority

        class DummySelector:
            def __init__(self, id: int, name: str, patterns: list[DummyPattern]):
                self.id = id
                self.name = name
                self.patterns = patterns

        class DummyStage:
            def __init__(self, id: int, key: str, suffix: str = "", sort_order: int = 0):
                self.id = id
                self.key = key
                self.suffix = suffix
                self.sort_order = sort_order

        class DummyMaster:
            def __init__(self, id: int, base_key: str):
                self.id = id
                self.base_key = base_key

        class DummyVariant:
            def __init__(
                self,
                id: int,
                master: DummyMaster,
                stage: DummyStage,
                binding_rule_set: DummyRuleSet,
                node_selector: Optional[DummySelector] = None,
            ):
                self.id = id
                self.master_id = master.id
                self.stage_id = stage.id
                self.master = master
                self.stage = stage
                self.binding_rule_set = binding_rule_set
                self.node_selector = node_selector
                self.role = f"{master.base_key}{stage.suffix}"
                self.is_enabled = True

            @property
            def computed_role(self) -> str:
                return self.role

        master = DummyMaster(1, "steps")
        stage_main = DummyStage(1, "main", "", sort_order=1)
        stage_detail = DummyStage(2, "detail", "_detail", sort_order=2)

        rule_set = DummyRuleSet(1, "steps_rule", [DummyEntry("KSampler", "steps", 1)])

        # Conflict 1: Exact vs Contains
        # Variant Main has contains "Sampler"
        # Variant Detail has exact "Detail Sampler"
        sel_main_contains = DummySelector(1, "main_sel", [DummyPattern("Sampler", match_type="contains")])
        sel_detail_exact = DummySelector(2, "detail_sel", [DummyPattern("Detail Sampler", match_type="exact")])

        var_main = DummyVariant(1, master, stage_main, rule_set, sel_main_contains)
        var_detail = DummyVariant(2, master, stage_detail, rule_set, sel_detail_exact)

        workflow_conflict = {
            "10": {
                "class_type": "KSampler",
                "inputs": {"steps": 10},
                "_meta": {"title": "Detail Sampler"},  # Matches Main (contains) & Detail (exact)
            },
            "20": {
                "class_type": "KSampler",
                "inputs": {"steps": 20},
                "_meta": {"title": "Main Sampler"},  # Matches Main (contains)
            },
        }

        res = scan_workflow_variants(workflow_conflict, [var_main, var_detail])
        matches = {m["role"]: (m["node_id"], m["input_name"]) for m in res["matched"]}
        # Node 10 must be assigned to Detail (exact > contains), Node 20 to Main
        self.assertEqual(matches["steps_detail"], ("10", "steps"))
        self.assertEqual(matches["steps"], ("20", "steps"))

        # Conflict 2: Contains vs Contains with longer pattern string specificity
        # Variant Main has contains "Sampler" (len 7)
        # Variant Detail has contains "High Detail Sampler" (len 19)
        sel_detail_longer = DummySelector(3, "detail_long", [DummyPattern("High Detail Sampler", match_type="contains")])
        var_detail_longer = DummyVariant(3, master, stage_detail, rule_set, sel_detail_longer)

        workflow_longer = {
            "30": {
                "class_type": "KSampler",
                "inputs": {"steps": 30},
                "_meta": {"title": "Prefix High Detail Sampler Postfix"},
            },
            "40": {
                "class_type": "KSampler",
                "inputs": {"steps": 40},
                "_meta": {"title": "Other Sampler"},
            },
        }

        res2 = scan_workflow_variants(workflow_longer, [var_main, var_detail_longer])
        matches2 = {m["role"]: (m["node_id"], m["input_name"]) for m in res2["matched"]}
        self.assertEqual(matches2["steps_detail"], ("30", "steps"))
        self.assertEqual(matches2["steps"], ("40", "steps"))

        # Conflict 3: Elimination of confirmed pairs for variants of the same master
        # Only 1 node in workflow, no selectors. Main (sort_order=1) confirms it, Detail gets not_found.
        var_main_nosel = DummyVariant(4, master, stage_main, rule_set, None)
        var_detail_nosel = DummyVariant(5, master, stage_detail, rule_set, None)

        workflow_single = {
            "50": {
                "class_type": "KSampler",
                "inputs": {"steps": 50},
                "_meta": {"title": "Only One Sampler"},
            }
        }
        res3 = scan_workflow_variants(workflow_single, [var_main_nosel, var_detail_nosel])
        self.assertEqual(len(res3["matched"]), 1)
        self.assertEqual(res3["matched"][0]["role"], "steps")
        self.assertEqual(res3["matched"][0]["node_id"], "50")
        self.assertEqual(res3["matched"][0]["input_name"], "steps")

        # Detail must get not_found
        detail_warnings = [w for w in res3["warnings"] if w["role"] == "steps_detail"]
        self.assertEqual(len(detail_warnings), 1)
        self.assertEqual(detail_warnings[0]["status"], "not_found")

    def test_req419_ac13_scanner_ignores_stage_search_keywords(self):
        """[REQ-419/AC-13] Stage search_keywords never influence scan stage ranking."""
        from app.services.workflow_scanner import scan_master_variants_detailed

        entries = [_Entry("KSampler", "steps")]
        master = _Master(1, "steps")
        var_main = _Variant(1, master, _Stage(1, "main", "", 0, "[]"), entries)
        var_rough = _Variant(2, master, _Stage(2, "rough", "_rough", 1, '["rough"]'), entries)
        workflow = {
            "1": _node("KSampler (Rough)", {"steps": 10}),
            "2": _node("KSampler", {"steps": 20}),
        }

        results = scan_master_variants_detailed(workflow, [var_main, var_rough])
        by_id = {r["variant"].id: r for r in results}
        for vid in (1, 2):
            self.assertTrue(by_id[vid]["candidates"])
            for cand in by_id[vid]["candidates"]:
                self.assertEqual(cand["stage_rank"], 3)
        self.assertEqual([c["node_id"] for c in by_id[1]["candidates"]], ["1", "2"])
        self.assertEqual(by_id[2]["confirmed"]["node_id"], "2")

    def test_req419_ac13_scanner_ignores_master_legacy_fields(self):
        """[REQ-419/AC-13] Master legacy columns and extra_title_patterns do not produce candidates or stages."""
        from app.services.workflow_scanner import scan_master_variants_detailed

        legacy_master = _Master(
            1, "steps", expected_class_types='["KSampler"]', param_name="steps"
        )
        var_empty = _Variant(1, legacy_master, _Stage(1, "main", "", 0), entries=[])

        master2 = _Master(2, "cfg", base_title_patterns='["Target"]', title_patterns='["Target"]')
        var_nosel = _Variant(
            2, master2, _Stage(2, "main", "", 0), [_Entry("KSampler", "steps")],
            extra_title_patterns='["Target"]',
        )
        workflow = {"7": _node("Target", {"steps": 10})}

        results = scan_master_variants_detailed(workflow, [var_empty, var_nosel])
        by_id = {r["variant"].id: r for r in results}
        self.assertEqual(by_id[1]["status"], "not_found")
        self.assertIsNone(by_id[1]["confirmed"])
        self.assertEqual(by_id[1]["candidates"], [])
        self.assertEqual(by_id[2]["status"], "ok")
        self.assertEqual(by_id[2]["confirmed"]["stage_rank"], 3)

    def test_req419_ac13_scanner_legacy_only_and_keyword_only_nodes(self):
        """[REQ-419/AC-13] (a) nodes matched only by legacy columns and (b) nodes matched only by legacy keywords/titles get no preference."""
        from app.services.workflow_scanner import scan_master_variants_detailed

        master = _Master(
            1, "steps",
            expected_class_types='["KSamplerAdvanced"]',
            fallback_param_names='["noise_seed"]',
            title_patterns='["Rough Pass"]',
            base_title_patterns='["Rough Pass"]',
        )
        stage = _Stage(1, "rough", "_rough", 0, '["rough"]')
        variant = _Variant(1, master, stage, [_Entry("KSampler", "steps")])
        workflow = {
            "10": _node("Legacy Only", {"noise_seed": 1}, class_type="KSamplerAdvanced"),
            "20": _node("Other Sampler", {"steps": 5}),
            "30": _node("Rough Pass", {"steps": 6}),
        }

        (res,) = scan_master_variants_detailed(workflow, [variant])
        cand_ids = [c["node_id"] for c in res["candidates"]]
        self.assertNotIn("10", cand_ids)
        self.assertNotEqual((res["confirmed"] or {}).get("node_id"), "10")
        self.assertEqual(cand_ids, ["20", "30"])
        by_node = {c["node_id"]: c for c in res["candidates"]}
        self.assertEqual(by_node["30"]["stage_rank"], 3)
        self.assertEqual(by_node["30"]["pattern_priority"], by_node["20"]["pattern_priority"])
        self.assertEqual(res["confirmed"]["node_id"], "20")

    def test_req419_ac9_detailed_scan_reports_stage_and_candidates(self):
        """[REQ-419/AC-9] Detailed scan reports stage rank, duplicates, not_found, disabled and exclusion."""
        from app.services.workflow_scanner import scan_master_variants_detailed

        entries = [_Entry("KSampler", "steps")]
        master = _Master(1, "steps")

        # Stage ranks 1 / 2 / 3
        main = _Variant(1, master, _Stage(1, "main", "", 0), entries)
        rough = _Variant(2, master, _Stage(2, "rough", "_rough", 1), entries, [_Pattern("Rough Sampler", "exact")])
        detail = _Variant(3, master, _Stage(3, "detail", "_detail", 2), entries, [_Pattern("detail")])
        workflow = {
            "1": _node("Plain", {"steps": 1}),
            "2": _node("Rough Sampler", {"steps": 2}),
            "3": _node("My Detail Pass", {"steps": 3}),
        }
        results = scan_master_variants_detailed(workflow, [detail, rough, main])
        self.assertEqual([r["variant"].id for r in results], [1, 2, 3])
        self.assertEqual([r["status"] for r in results], ["ok", "ok", "ok"])
        self.assertEqual([r["confirmed"]["stage_rank"] for r in results], [3, 1, 2])
        self.assertEqual([r["confirmed"]["node_id"] for r in results], ["1", "2", "3"])
        for r in results:
            self.assertEqual(
                set(r["confirmed"].keys()),
                {"node_id", "numeric_id", "stage_rank", "entry_priority", "pattern_priority",
                 "input_name", "node_title", "class_type"},
            )
            self.assertNotIn(4, [c["stage_rank"] for c in r["candidates"]])

        # Duplicated within the top stage; confirmed is the first candidate
        workflow_dup = {
            "5": _node("Detail B", {"steps": 1}),
            "4": _node("Detail A", {"steps": 2}),
        }
        results = scan_master_variants_detailed(workflow_dup, [main, detail])
        by_id = {r["variant"].id: r for r in results}
        self.assertEqual(by_id[3]["status"], "duplicated")
        self.assertEqual([c["node_id"] for c in by_id[3]["candidates"]], ["4", "5"])
        self.assertEqual(by_id[3]["confirmed"], by_id[3]["candidates"][0])
        self.assertEqual(by_id[1]["status"], "not_found")

        # not_found with no matching node
        results = scan_master_variants_detailed({"1": _node("X", {"cfg": 1})}, [main])
        self.assertEqual(results[0]["status"], "not_found")
        self.assertIsNone(results[0]["confirmed"])

        # disabled variant does not consume candidates and is still reported
        disabled = _Variant(1, master, _Stage(1, "main", "", 0), entries, is_enabled=False)
        alt = _Variant(2, master, _Stage(2, "alt", "_alt", 1), entries)
        results = scan_master_variants_detailed({"1": _node("Plain", {"steps": 1})}, [alt, disabled])
        self.assertEqual([r["variant"].id for r in results], [1, 2])
        self.assertEqual(results[0]["status"], "disabled")
        self.assertIsNone(results[0]["confirmed"])
        self.assertEqual(results[0]["candidates"], [])
        self.assertEqual(results[1]["status"], "ok")
        self.assertEqual(results[1]["confirmed"]["node_id"], "1")

        # nodes confirmed by an earlier variant are excluded from later candidates
        alt2 = _Variant(2, master, _Stage(2, "alt", "_alt", 1), entries)
        workflow_two = {"1": _node("A", {"steps": 1}), "2": _node("B", {"steps": 2})}
        results = scan_master_variants_detailed(workflow_two, [main, alt2])
        self.assertEqual(results[0]["status"], "duplicated")
        self.assertEqual(results[0]["confirmed"]["node_id"], "1")
        self.assertEqual([c["node_id"] for c in results[1]["candidates"]], ["2"])
        self.assertEqual(results[1]["status"], "ok")

        # non-dict workflow does not raise
        results = scan_master_variants_detailed(["bad"], [main, disabled])  # type: ignore[arg-type]
        self.assertEqual(sorted(r["status"] for r in results), ["disabled", "not_found"])

    def test_req419_ac9_detailed_scan_excludes_other_variant_selector_nodes(self):
        """[REQ-419/AC-9] A node claimed by another variant's selector is not a candidate of a selector-less variant."""
        from app.services.workflow_scanner import scan_master_variants_detailed

        entries = [_Entry("KSampler", "steps")]
        master = _Master(1, "steps")
        main = _Variant(1, master, _Stage(1, "main", "", 0), entries)
        rough = _Variant(2, master, _Stage(2, "rough", "_rough", 1), entries, [_Pattern("Rough Sampler", "exact")])
        workflow = {
            "1": _node("Rough Sampler", {"steps": 1}),
            "2": _node("Plain", {"steps": 2}),
        }
        results = scan_master_variants_detailed(workflow, [main, rough])
        by_id = {r["variant"].id: r for r in results}
        self.assertEqual(by_id[1]["confirmed"]["node_id"], "2")
        self.assertNotIn("1", [c["node_id"] for c in by_id[1]["candidates"]])
        self.assertEqual(by_id[2]["confirmed"]["node_id"], "1")
