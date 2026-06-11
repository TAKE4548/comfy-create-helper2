import sqlite3
import json

conn = sqlite3.connect("c:\\Users\\audih\\ws\\comfy-create-helper2\\db\\prompt_surgeon.db")
cursor = conn.cursor()

cursor.execute("SELECT json_body FROM workflows WHERE id = 2")
row = cursor.fetchone()
if row:
    wf_json = json.loads(row[0])
    for nid, ndata in wf_json.items():
        if isinstance(ndata, dict):
            title = ndata.get("_meta", {}).get("title", "")
            class_type = ndata.get("class_type", "")
            if "prompt" in title.lower() or "composition" in title.lower() or "background" in title.lower() or "lighting" in title.lower() or "lora" in title.lower() or "char" in title.lower():
                print(f"Node ID: {nid}, Class: {class_type}, Title: {title}")
conn.close()
