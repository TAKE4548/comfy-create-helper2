import sqlite3
from pathlib import Path


def migrate(db_path: str = "db/prompt_surgeon.db") -> int:
    resolved_path = Path(db_path).resolve()
    if not resolved_path.exists():
        project_root_db = Path(__file__).resolve().parent.parent / "db" / "prompt_surgeon.db"
        if project_root_db.exists():
            resolved_path = project_root_db

    conn = sqlite3.connect(str(resolved_path))
    cur = conn.cursor()
    cur.execute("""
        UPDATE workflow_presets 
        SET param_values = replace(param_values, '"Resolution Selecto":', '"Resolution Selector":')
        WHERE param_values LIKE '%"Resolution Selecto":%'
    """)
    affected = cur.rowcount
    conn.commit()
    conn.close()
    print(f"Migrated {affected} presets successfully in {resolved_path}.")
    return affected


if __name__ == "__main__":
    migrate()
