import sqlite3, os

DB_PATH = os.environ.get("DB_PATH")
if not DB_PATH:
    if os.path.exists("db/prompt_surgeon.db"):
        DB_PATH = "db/prompt_surgeon.db"
    elif os.path.exists("../db/prompt_surgeon.db"):
        DB_PATH = "../db/prompt_surgeon.db"
    else:
        DB_PATH = "db/prompt_surgeon.db"

print(f"Connecting to database: {DB_PATH}")
con = sqlite3.connect(DB_PATH)
try:
    con.execute("ALTER TABLE workflow_presets ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
    print("Added sort_order column to workflow_presets table.")
except Exception as e:
    print(f"Column sort_order might already exist or table doesn't exist: {e}")

rows = con.execute("SELECT id FROM workflow_presets ORDER BY id ASC").fetchall()
for i, (pid,) in enumerate(rows):
    con.execute("UPDATE workflow_presets SET sort_order = ? WHERE id = ?", (i, pid))
con.commit()
con.close()
print("Migration complete.")
