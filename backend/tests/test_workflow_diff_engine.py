"""Unit tests for workflow diff engine and topology matching logic."""

import pytest
from app.services.workflow_diff_engine import (
    WorkflowDiffEngine,
    compute_similarity,
    extract_topology,
    jaccard_similarity,
    levenshtein_ratio,
    match_role,
)


@pytest.fixture
def sample_api_workflow():
    """Standard ComfyUI API prompt format workflow."""
    return {
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": "v1-5-pruned-emaonly.ckpt"
            },
            "_meta": {
                "title": "Load Checkpoint"
            }
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": 512,
                "height": 512,
                "batch_size": 1
            },
            "_meta": {
                "title": "Empty Latent Image"
            }
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": "masterpiece, 1girl, smiling",
                "clip": ["4", 1]
            },
            "_meta": {
                "title": "Positive Prompt"
            }
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": "worst quality, low quality",
                "clip": ["4", 1]
            },
            "_meta": {
                "title": "Negative Prompt"
            }
        },
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 12345678,
                "steps": 20,
                "cfg": 8.0,
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": 1.0,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0]
            },
            "_meta": {
                "title": "KSampler"
            }
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["3", 0],
                "vae": ["4", 2]
            },
            "_meta": {
                "title": "VAE Decode"
            }
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": "ComfyUI",
                "images": ["8", 0]
            },
            "_meta": {
                "title": "Save Image"
            }
        }
    }


@pytest.fixture
def sample_ui_workflow():
    """Standard ComfyUI UI format workflow."""
    return {
        "nodes": [
            {
                "id": 4,
                "type": "CheckpointLoaderSimple",
                "title": "Load Checkpoint",
                "inputs": [],
                "outputs": [
                    {"name": "MODEL", "type": "MODEL", "links": [1]},
                    {"name": "CLIP", "type": "CLIP", "links": [2, 3]},
                    {"name": "VAE", "type": "VAE", "links": [6]}
                ]
            },
            {
                "id": 6,
                "type": "CLIPTextEncode",
                "title": "Positive Prompt",
                "inputs": [{"name": "clip", "type": "CLIP", "link": 2}],
                "outputs": [{"name": "CONDITIONING", "type": "CONDITIONING", "links": [4]}]
            },
            {
                "id": 3,
                "type": "KSampler",
                "title": "KSampler",
                "inputs": [
                    {"name": "model", "type": "MODEL", "link": 1},
                    {"name": "positive", "type": "CONDITIONING", "link": 4}
                ],
                "outputs": [{"name": "LATENT", "type": "LATENT", "links": [5]}]
            }
        ],
        "links": [
            [1, 4, 0, 3, 0, "MODEL"],
            [2, 4, 1, 6, 0, "CLIP"],
            [4, 6, 0, 3, 1, "CONDITIONING"]
        ]
    }


def test_jaccard_similarity_empty():
    assert jaccard_similarity(set(), set()) == 1.0


def test_jaccard_similarity_overlap():
    assert jaccard_similarity({1, 2}, {1, 2}) == 1.0
    assert jaccard_similarity({1, 2}, {2, 3}) == 1 / 3
    assert jaccard_similarity({1, 2}, {3, 4}) == 0.0


def test_identical_workflow_score_100(sample_api_workflow):
    """AC-1 requirement: Identical workflows yield 100.0 score for all nodes."""
    topos = extract_topology(sample_api_workflow)
    assert len(topos) == 7

    for node_id, node_topo in topos.items():
        score, reason = compute_similarity(node_topo, node_topo, topos, topos)
        assert score == 100.0, f"Node {node_id} expected score 100.0, got {score}: {reason}"

    roles = [
        {"master_id": 1, "role": "positive", "display_name": "Positive Prompt", "node_id": "6"},
        {"master_id": 2, "role": "negative", "display_name": "Negative Prompt", "node_id": "7"},
        {"master_id": 3, "role": "sampler", "display_name": "KSampler", "node_id": "3"},
    ]
    results = WorkflowDiffEngine.analyze_role_migrations(sample_api_workflow, sample_api_workflow, roles)
    assert len(results) == 3
    for r in results:
        assert r["status"] == "ok"
        assert r["confidence"] == 100.0
        assert r["new_node_id"] == r["old_node_id"]


def test_reindexed_node_identification(sample_api_workflow):
    """AC-1: Re-indexed node (ID changed) identified via topology with score >= 80."""
    new_workflow = dict(sample_api_workflow)
    # Move KSampler from ID '3' to '300'
    ksampler = dict(new_workflow.pop("3"))
    new_workflow["300"] = ksampler

    # Update downstream VAEDecode input reference from 3 to 300
    new_workflow["8"] = dict(new_workflow["8"])
    new_workflow["8"]["inputs"] = dict(new_workflow["8"]["inputs"])
    new_workflow["8"]["inputs"]["samples"] = ["300", 0]

    old_topos = extract_topology(sample_api_workflow)
    new_topos = extract_topology(new_workflow)

    migration = match_role(
        old_node_id="3",
        old_topologies=old_topos,
        new_topologies=new_topos,
        master_id=10,
        role="sampler",
        display_name="KSampler",
    )

    assert migration["status"] == "reindexed"
    assert migration["new_node_id"] == "300"
    assert migration["confidence"] >= 80.0
    # Expected score: 35 (class) + 30 (inputs) + 20 (outputs) + 10 (title) + 0 (id bonus) = 95.0
    assert migration["confidence"] == 95.0


def test_renamed_node_identification(sample_api_workflow):
    """AC-1: Renamed node identified with high score (>= 80)."""
    new_workflow = dict(sample_api_workflow)
    # Rename node 6 from 'Positive Prompt' to 'Hero Positive Prompt'
    new_workflow["6"] = dict(new_workflow["6"])
    new_workflow["6"]["_meta"] = {"title": "Hero Positive Prompt"}

    old_topos = extract_topology(sample_api_workflow)
    new_topos = extract_topology(new_workflow)

    migration = match_role(
        old_node_id="6",
        old_topologies=old_topos,
        new_topologies=new_topos,
        master_id=1,
        role="positive",
        display_name="Positive Prompt",
    )

    assert migration["status"] == "renamed"
    assert migration["new_node_id"] == "6"
    assert migration["confidence"] >= 80.0


def test_false_reuse_detection(sample_api_workflow):
    """AC-2: ID match but completely different class/wiring is detected as false_reuse (score < 40)."""
    new_workflow = dict(sample_api_workflow)
    # Node "5" was EmptyLatentImage. Replace node "5" with SaveImage connected to nothing
    new_workflow["5"] = {
        "class_type": "SaveImage",
        "inputs": {
            "filename_prefix": "Hacked",
            "images": ["999", 0]
        },
        "_meta": {
            "title": "Random Unrelated Saver"
        }
    }

    old_topos = extract_topology(sample_api_workflow)
    new_topos = extract_topology(new_workflow)

    migration = match_role(
        old_node_id="5",
        old_topologies=old_topos,
        new_topologies=new_topos,
        master_id=5,
        role="latent",
        display_name="Empty Latent Image",
    )

    assert migration["status"] == "false_reuse"
    assert migration["confidence"] < 40.0
    assert migration["new_node_id"] is None
    assert "ID不正再利用" in migration["reason"] or "false_reuse" in migration["status"]


def test_false_reuse_reindexed_to_actual_node(sample_api_workflow):
    """AC-2: If ID was reused by another node, but real node moved to new ID, detect reindexed with warning."""
    new_workflow = dict(sample_api_workflow)
    # Move EmptyLatentImage from "5" to "55"
    old_latent = dict(new_workflow.pop("5"))
    new_workflow["55"] = old_latent

    # Update KSampler reference
    new_workflow["3"] = dict(new_workflow["3"])
    new_workflow["3"]["inputs"] = dict(new_workflow["3"]["inputs"])
    new_workflow["3"]["inputs"]["latent_image"] = ["55", 0]

    # Re-use ID "5" for unrelated SaveImage
    new_workflow["5"] = {
        "class_type": "SaveImage",
        "inputs": {"filename_prefix": "New"},
        "_meta": {"title": "New Saver"}
    }

    old_topos = extract_topology(sample_api_workflow)
    new_topos = extract_topology(new_workflow)

    migration = match_role(
        old_node_id="5",
        old_topologies=old_topos,
        new_topologies=new_topos,
        master_id=5,
        role="latent",
        display_name="Empty Latent Image",
    )

    assert migration["status"] == "reindexed"
    assert migration["new_node_id"] == "55"
    assert migration["confidence"] >= 80.0
    assert "再利用" in migration["reason"]


def test_symmetric_lora_disambiguation():
    """LoRA chain test: Verify topology distinguishes between two identical-class nodes in series."""
    old_workflow = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {}},
        "10": {
            "class_type": "LoraLoader",
            "inputs": {"model": ["1", 0], "clip": ["1", 1]},
            "_meta": {"title": "LoRA 1 (Character)"}
        },
        "11": {
            "class_type": "LoraLoader",
            "inputs": {"model": ["10", 0], "clip": ["10", 1]},
            "_meta": {"title": "LoRA 2 (Style)"}
        },
        "3": {
            "class_type": "KSampler",
            "inputs": {"model": ["11", 0]},
            "_meta": {"title": "KSampler"}
        }
    }

    # New workflow has IDs reindexed: 10 -> 20, 11 -> 21
    new_workflow = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {}},
        "20": {
            "class_type": "LoraLoader",
            "inputs": {"model": ["1", 0], "clip": ["1", 1]},
            "_meta": {"title": "LoRA 1 (Character)"}
        },
        "21": {
            "class_type": "LoraLoader",
            "inputs": {"model": ["20", 0], "clip": ["20", 1]},
            "_meta": {"title": "LoRA 2 (Style)"}
        },
        "3": {
            "class_type": "KSampler",
            "inputs": {"model": ["21", 0]},
            "_meta": {"title": "KSampler"}
        }
    }

    old_topos = extract_topology(old_workflow)
    new_topos = extract_topology(new_workflow)

    mig_10 = match_role("10", old_topos, new_topos)
    mig_11 = match_role("11", old_topos, new_topos)

    assert mig_10["new_node_id"] == "20"
    assert mig_10["status"] == "reindexed"
    assert mig_11["new_node_id"] == "21"
    assert mig_11["status"] == "reindexed"


def test_ui_format_topology_extraction(sample_ui_workflow):
    """Verify ComfyUI UI graph format topology extraction."""
    topos = extract_topology(sample_ui_workflow)
    assert len(topos) == 3
    assert "4" in topos
    assert "6" in topos
    assert "3" in topos

    assert topos["4"]["class_type"] == "CheckpointLoaderSimple"
    assert len(topos["4"]["outputs"]) == 2  # link 1 to 3, link 2 to 6
    assert topos["3"]["inputs"][0]["source_node_id"] == "4"

    # Compare UI workflow against itself
    diff = WorkflowDiffEngine.analyze_all_nodes_diff(sample_ui_workflow, sample_ui_workflow)
    assert len(diff) == 3
    for d in diff:
        assert d["status"] == "ok"
        assert d["confidence"] == 100.0


def test_not_found_node(sample_api_workflow):
    """Old node completely missing in new workflow."""
    new_workflow = dict(sample_api_workflow)
    new_workflow.pop("7")  # Remove negative prompt

    old_topos = extract_topology(sample_api_workflow)
    new_topos = extract_topology(new_workflow)

    migration = match_role("7", old_topos, new_topos, master_id=7, role="negative")
    # Node 6 (positive prompt) has same class but different title and different output wiring
    # Node 7 should either find node 6 as low confidence candidate or not_found if threshold
    # Note: node 6 has title "Positive Prompt" vs "Negative Prompt" and different output connection
    assert migration["status"] in ("reindexed", "renamed", "not_found")
    if migration["status"] != "not_found":
        # Even if it matches node 6, confidence must be lower than exact match
        assert migration["confidence"] < 100.0
