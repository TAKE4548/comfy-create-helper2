"""
Migration script: Streamlit v1 DB → Prompt Surgeon v2 DB

Usage:
    python scripts/migrate_from_v1.py \
        --src "/path/to/v1/prompt_surgeon.db" \
        --dst "../db/prompt_surgeon.db"
"""

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from datetime import datetime


def connect(path: str, foreign_keys: bool = True) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    fk_val = "ON" if foreign_keys else "OFF"
    conn.execute(f"PRAGMA foreign_keys = {fk_val}")
    return conn


def migrate(src_path: str, dst_path: str):
    print(f"Source DB : {src_path}")
    print(f"Target DB : {dst_path}")

    src = connect(src_path)
    dst = connect(dst_path, foreign_keys=False)  # Disable FK during bulk insert

    src_cur = src.cursor()
    dst_cur = dst.cursor()

    # ── 1. LoRA categories (mapping from old category TEXT → new category_id INT) ──
    src_cur.execute("SELECT DISTINCT category FROM loras WHERE category IS NOT NULL")
    old_lora_cats = [row[0] for row in src_cur.fetchall()]
    lora_cat_map: dict[str, int] = {}
    for cat_name in old_lora_cats:
        dst_cur.execute("SELECT id FROM lora_categories WHERE name = ?", (cat_name,))
        row = dst_cur.fetchone()
        if row:
            lora_cat_map[cat_name] = row[0]
        else:
            dst_cur.execute("INSERT INTO lora_categories (name) VALUES (?)", (cat_name,))
            lora_cat_map[cat_name] = dst_cur.lastrowid
            print(f"  [+] lora_category: {cat_name}")

    # ── 2. Tagset categories ─────────────────────────────────────
    src_cur.execute("SELECT name FROM custom_categories")
    old_tagset_cats = [row[0] for row in src_cur.fetchall()]
    tagset_cat_map: dict[str, int] = {}
    for cat_name in old_tagset_cats:
        dst_cur.execute("SELECT id FROM tagset_categories WHERE name = ?", (cat_name,))
        row = dst_cur.fetchone()
        if row:
            tagset_cat_map[cat_name] = row[0]
        else:
            dst_cur.execute("INSERT INTO tagset_categories (name) VALUES (?)", (cat_name,))
            tagset_cat_map[cat_name] = dst_cur.lastrowid
            print(f"  [+] tagset_category: {cat_name}")

    # ── 3. LoRAs (name PK → id INT PK) ───────────────────────────
    src_cur.execute("SELECT name, description, recommended_strength, category FROM loras")
    old_loras = src_cur.fetchall()
    lora_name_to_id: dict[str, int] = {}
    for row in old_loras:
        lora_name = row["name"]
        dst_cur.execute("SELECT id FROM loras WHERE model_name = ?", (lora_name,))
        existing = dst_cur.fetchone()
        if existing:
            lora_name_to_id[lora_name] = existing[0]
            continue
        cat_id = lora_cat_map.get(row["category"]) if row["category"] else None
        strength = row["recommended_strength"]
        dst_cur.execute(
            "INSERT INTO loras (model_name, description, recommended_strength_min, recommended_strength_max, category_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (lora_name, row["description"], strength, strength, cat_id, datetime.utcnow().isoformat()),
        )
        new_id = dst_cur.lastrowid
        lora_name_to_id[lora_name] = new_id
        print(f"  [+] lora: {lora_name}")

    # ── 4. LoRA trigger word sets ─────────────────────────────────
    src_cur.execute("SELECT lora_name, set_name, trigger_words FROM lora_trigger_sets")
    for row in src_cur.fetchall():
        lora_id = lora_name_to_id.get(row["lora_name"])
        if not lora_id:
            continue
        words = [w.strip() for w in row["trigger_words"].split(",") if w.strip()]
        dst_cur.execute(
            "INSERT INTO lora_trigger_word_sets (lora_id, name, words) VALUES (?, ?, ?)",
            (lora_id, row["set_name"], json.dumps(words)),
        )

    # ── 5. Tag sets ───────────────────────────────────────────────
    src_cur.execute("SELECT name, description, category, tags FROM custom_tag_sets")
    for row in src_cur.fetchall():
        cat_id = tagset_cat_map.get(row["category"]) if row["category"] else None
        tags_raw = row["tags"]
        try:
            tags_list = json.loads(tags_raw) if tags_raw.startswith("[") else [t.strip() for t in tags_raw.split(",") if t.strip()]
        except Exception:
            tags_list = [t.strip() for t in tags_raw.split(",") if t.strip()]
        dst_cur.execute(
            "INSERT INTO tag_sets (name, description, category_id, tags, created_at) VALUES (?, ?, ?, ?, ?)",
            (row["name"], row["description"], cat_id, json.dumps(tags_list), datetime.utcnow().isoformat()),
        )
        print(f"  [+] tag_set: {row['name']}")

    # ── 6. Workflows ──────────────────────────────────────────────
    src_cur.execute("SELECT id, name, json_body, created_at FROM workflows")
    old_workflows = src_cur.fetchall()
    old_to_new_wf: dict[int, int] = {}
    for row in old_workflows:
        dst_cur.execute("SELECT id FROM workflows WHERE name = ?", (row["name"],))
        existing = dst_cur.fetchone()
        if existing:
            old_to_new_wf[row["id"]] = existing[0]
            continue
        dst_cur.execute(
            "INSERT INTO workflows (name, json_body, created_at) VALUES (?, ?, ?)",
            (row["name"], row["json_body"], row["created_at"]),
        )
        new_id = dst_cur.lastrowid
        old_to_new_wf[row["id"]] = new_id
        print(f"  [+] workflow: {row['name']}")

    # ── 7. Workflow mappings ──────────────────────────────────────
    src_cur.execute("SELECT workflow_id, master_id, node_id FROM workflow_mappings")
    for row in src_cur.fetchall():
        new_wf_id = old_to_new_wf.get(row["workflow_id"])
        if not new_wf_id:
            continue
        dst_cur.execute(
            "INSERT OR IGNORE INTO workflow_mappings (workflow_id, master_id, node_id) VALUES (?, ?, ?)",
            (new_wf_id, row["master_id"], row["node_id"]),
        )

    # ── 8. Snapshots (prompt_data → params) ──────────────────────
    src_cur.execute("SELECT id, workflow_id, prompt_data, image_path, created_at FROM snapshots")
    old_to_new_snap: dict[int, int] = {}
    for row in src_cur.fetchall():
        new_wf_id = old_to_new_wf.get(row["workflow_id"])
        if not new_wf_id:
            continue
        # prompt_data may already be JSON dict or legacy format
        params_raw = row["prompt_data"] or "{}"
        try:
            params_obj = json.loads(params_raw)
        except Exception:
            params_obj = {"raw": params_raw}
        dst_cur.execute(
            "INSERT INTO snapshots (workflow_id, params, image_path, created_at) VALUES (?, ?, ?, ?)",
            (new_wf_id, json.dumps(params_obj), row["image_path"], row["created_at"]),
        )
        new_snap_id = dst_cur.lastrowid
        old_to_new_snap[row["id"]] = new_snap_id

    # ── 9. Albums ─────────────────────────────────────────────────
    src_cur.execute("SELECT id, name, created_at FROM albums")
    old_to_new_album: dict[int, int] = {}
    for row in src_cur.fetchall():
        dst_cur.execute("SELECT id FROM albums WHERE name = ?", (row["name"],))
        existing = dst_cur.fetchone()
        if existing:
            old_to_new_album[row["id"]] = existing[0]
            continue
        dst_cur.execute(
            "INSERT INTO albums (name, created_at) VALUES (?, ?)",
            (row["name"], row["created_at"]),
        )
        old_to_new_album[row["id"]] = dst_cur.lastrowid
        print(f"  [+] album: {row['name']}")

    # ── 10. Album items ───────────────────────────────────────────
    src_cur.execute("SELECT album_id, snapshot_id, sequence_order FROM album_items")
    for row in src_cur.fetchall():
        new_album_id = old_to_new_album.get(row["album_id"])
        new_snap_id = old_to_new_snap.get(row["snapshot_id"])
        if not new_album_id or not new_snap_id:
            continue
        dst_cur.execute(
            "INSERT OR IGNORE INTO album_items (album_id, snapshot_id, sequence_order) VALUES (?, ?, ?)",
            (new_album_id, new_snap_id, row["sequence_order"]),
        )

    dst.commit()
    src.close()
    dst.close()
    print("\n[OK] Migration completed successfully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate Prompt Surgeon v1 DB to v2")
    parser.add_argument("--src", required=True, help="Path to source (v1) SQLite DB")
    parser.add_argument("--dst", default="../db/prompt_surgeon.db", help="Path to destination (v2) SQLite DB")
    args = parser.parse_args()

    if not Path(args.src).exists():
        print(f"Error: Source DB not found: {args.src}")
        sys.exit(1)

    migrate(args.src, args.dst)
