import sqlite3
import json

conn = sqlite3.connect("c:\\Users\\audih\\ws\\comfy-create-helper2\\db\\prompt_surgeon.db")
cursor = conn.cursor()

cursor.execute("SELECT id, name, json_body FROM workflows")
for row in cursor.fetchall():
    wf_id, name, json_body = row
    print(f"\n================ WF ID {wf_id}: {name} ================")
    wf_json = json.loads(json_body)
    
    # Let's check nodes 366:344 and 366:345 if they exist in this workflow
    for node_key in ["366:344", "366:345"]:
        if node_key in wf_json:
            print(f"Node {node_key}:")
            print(json.dumps(wf_json[node_key], indent=2, ensure_ascii=False))
        else:
            # Let's search if any node matches Prompt_Char_Lora_Face or Prompt_Char_Lora_Other in metadata
            for nid, ndata in wf_json.items():
                title = ndata.get("_meta", {}).get("title", "")
                if "lora" in title.lower() or "char" in title.lower():
                    print(f"Nid: {nid}, Class: {ndata.get('class_type')}, Title: {title}")
    
    print("--- Mappings ---")
    cursor.execute("""
        SELECT wm.node_id, mm.role, mm.display_name, mm.id
        FROM workflow_mappings wm
        JOIN mapping_master mm ON wm.master_id = mm.id
        WHERE wm.workflow_id = ?
    """, (wf_id,))
    for m in cursor.fetchall():
        print(f"  Node ID: {m[0]} -> Role: {m[1]} ({m[2]}) [Master ID: {m[3]}]")

conn.close()
