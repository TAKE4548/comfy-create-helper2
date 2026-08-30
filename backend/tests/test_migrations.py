import unittest
import sqlalchemy as sa
from sqlalchemy import create_engine
from app.database import Base
from app import models
from app.migrations import run_migrations, MigrationRunner


class TestDatabaseMigrations(unittest.TestCase):
    def test_run_migrations_on_empty_db_is_idempotent(self):
        """新規作成されたDBに対して run_migrations を複数回実行しても安全かつエラーが発生しないこと（べき等性）"""
        test_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=test_engine)

        # 1回目の実行
        run_migrations(target_engine=test_engine)

        # 2回目の実行（二重適用でもエラーにならないこと）
        run_migrations(target_engine=test_engine)

        # テーブル一覧の確認
        with test_engine.connect() as conn:
            inspector = sa.inspect(conn)
            tables = inspector.get_table_names()
            self.assertIn("workflows", tables)
            self.assertIn("snapshots", tables)
            self.assertIn("param_type_masters", tables)
            self.assertIn("speech_bubble_presets", tables)
            self.assertIn("speech_tone_presets", tables)

    def test_legacy_database_full_migration(self):
        """古いスキーマのDBに対して run_migrations を実行し、すべてのカラム・制約が最新化されデータが保持されること"""
        legacy_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

        # レガシースキーマの構築（過去の古いテーブル定義）
        with legacy_engine.begin() as conn:
            # 1. workflows without target_base_model_id & default_applied_assets
            conn.execute(sa.text("""
                CREATE TABLE workflows (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR NOT NULL UNIQUE,
                    json_body TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """))
            conn.execute(sa.text("INSERT INTO workflows (name, json_body) VALUES ('W1', '{}');"))

            # 2. snapshots without source_snapshot_id & thumbnail_path
            conn.execute(sa.text("""
                CREATE TABLE snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workflow_id INTEGER NOT NULL,
                    params TEXT NOT NULL,
                    image_path TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """))
            conn.execute(sa.text("INSERT INTO snapshots (workflow_id, params, image_path) VALUES (1, '{}', 'img.png');"))

            # 3. loras without sort_order
            conn.execute(sa.text("""
                CREATE TABLE loras (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    model_name VARCHAR NOT NULL UNIQUE,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """))
            conn.execute(sa.text("INSERT INTO loras (model_name) VALUES ('Lora1'), ('Lora2');"))

            # 4. tag_sets without thumbnail_path and sort_order
            conn.execute(sa.text("""
                CREATE TABLE tag_sets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR NOT NULL,
                    tags TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """))
            conn.execute(sa.text("INSERT INTO tag_sets (name, tags) VALUES ('TS1', '[\"tag1\"]');"))

            # 5. snapshot_loras with old 2-column unique constraint
            conn.execute(sa.text("""
                CREATE TABLE snapshot_loras (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    snapshot_id INTEGER NOT NULL,
                    lora_id INTEGER NOT NULL,
                    strength FLOAT NOT NULL,
                    UNIQUE (snapshot_id, lora_id)
                );
            """))
            conn.execute(sa.text("INSERT INTO snapshot_loras (snapshot_id, lora_id, strength) VALUES (1, 1, 0.8);"))

            # 6. workflow_presets without updated_at
            conn.execute(sa.text("""
                CREATE TABLE workflow_presets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workflow_id INTEGER NOT NULL,
                    name VARCHAR NOT NULL,
                    param_values TEXT NOT NULL,
                    applied_assets TEXT NOT NULL,
                    batch_size INTEGER NOT NULL,
                    seed_mode VARCHAR NOT NULL,
                    seed INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    sort_order INTEGER NOT NULL DEFAULT 0
                );
            """))
            conn.execute(sa.text("""
                INSERT INTO workflow_presets (workflow_id, name, param_values, applied_assets, batch_size, seed_mode, seed)
                VALUES (1, 'P1', '{}', '{}', 1, 'fixed', 1234);
            """))

            # 7. speech_bubble_presets with old unique constraint on name alone
            conn.execute(sa.text("""
                CREATE TABLE speech_bubble_presets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR NOT NULL UNIQUE,
                    shape VARCHAR NOT NULL DEFAULT 'oval',
                    orientation VARCHAR NOT NULL DEFAULT 'vertical',
                    font_family VARCHAR NOT NULL DEFAULT 'sans-serif',
                    font_size INTEGER NOT NULL DEFAULT 0,
                    text_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    background_color VARCHAR NOT NULL DEFAULT 'rgba(255, 255, 255, 0.95)',
                    border_color VARCHAR NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
                    border_width INTEGER NOT NULL DEFAULT 2,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """))
            conn.execute(sa.text("INSERT INTO speech_bubble_presets (name, orientation) VALUES ('Legacy Preset', 'vertical');"))

        # マイグレーション実行
        run_migrations(target_engine=legacy_engine)

        with legacy_engine.connect() as conn:
            inspector = sa.inspect(conn)

            # workflows 検証
            wf_cols = [c["name"] for c in inspector.get_columns("workflows")]
            self.assertIn("default_applied_assets", wf_cols)
            self.assertIn("target_base_model_id", wf_cols)

            # snapshots 検証
            snap_cols = [c["name"] for c in inspector.get_columns("snapshots")]
            self.assertIn("source_snapshot_id", snap_cols)
            self.assertIn("thumbnail_path", snap_cols)

            # loras sort_order 検証
            lora_rows = conn.execute(sa.text("SELECT id, model_name, sort_order FROM loras ORDER BY id")).fetchall()
            self.assertEqual(len(lora_rows), 2)
            self.assertEqual(lora_rows[0][2], 0)
            self.assertEqual(lora_rows[1][2], 1)

            # snapshot_loras role および新ユニーク制約検証（同一 lora_id でも role が異なれば挿入可能）
            sl_cols = [c["name"] for c in inspector.get_columns("snapshot_loras")]
            self.assertIn("role", sl_cols)
            conn.execute(sa.text("INSERT INTO snapshot_loras (snapshot_id, lora_id, strength, role) VALUES (1, 1, 0.5, 'negative');"))

            # workflow_presets updated_at 検証
            wp_row = conn.execute(sa.text("SELECT updated_at FROM workflow_presets WHERE name = 'P1'")).fetchone()
            self.assertIsNotNone(wp_row[0])

            # speech_bubble_presets 新ユニーク制約検証（同名で別 orientation が挿入可能）
            conn.execute(sa.text("INSERT INTO speech_bubble_presets (name, orientation) VALUES ('Legacy Preset', 'horizontal');"))
            presets = conn.execute(sa.text("SELECT name, orientation FROM speech_bubble_presets WHERE name = 'Legacy Preset'")).fetchall()
            self.assertEqual(len(presets), 2)

    def test_schema_parity_between_fresh_and_migrated_db(self):
        """新規作成DBとレガシー移行後DBの間で、主要テーブルのカラム構成が完全に一致すること（SSoT整合性検証）"""
        fresh_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=fresh_engine)
        run_migrations(target_engine=fresh_engine)

        migrated_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=migrated_engine)
        run_migrations(target_engine=migrated_engine)

        with fresh_engine.connect() as conn_f, migrated_engine.connect() as conn_m:
            insp_f = sa.inspect(conn_f)
            insp_m = sa.inspect(conn_m)

            tables_f = set(insp_f.get_table_names())
            tables_m = set(insp_m.get_table_names())
            self.assertEqual(tables_f, tables_m)

            for table in tables_f:
                cols_f = {c["name"]: str(c["type"]) for c in insp_f.get_columns(table)}
                cols_m = {c["name"]: str(c["type"]) for c in insp_m.get_columns(table)}
                self.assertEqual(cols_f.keys(), cols_m.keys(), f"Column mismatch in table: {table}")

    def test_red_team_migration_step_failure_rolls_back_cleanly(self):
        """Red Teaming: マイグレーションステップ中に意図しない例外が発生した場合、トランザクションがロールバックされること"""
        from app.migrations.steps import MigrationStep

        fail_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        with fail_engine.begin() as conn:
            conn.execute(sa.text("CREATE TABLE test_table (id INTEGER PRIMARY KEY, val TEXT);"))
            conn.execute(sa.text("INSERT INTO test_table (val) VALUES ('initial_state');"))

        def failing_step_apply(conn, inspector):
            conn.execute(sa.text("INSERT INTO test_table (val) VALUES ('corrupted_state');"))
            raise RuntimeError("Simulated migration step crash")

        custom_runner = MigrationRunner(steps=[
            MigrationStep("fail_999", "failing_step", failing_step_apply)
        ])

        with self.assertRaises(RuntimeError):
            custom_runner.run(target_engine=fail_engine)

        # ロールバック検証: corrupted_state はコミットされず initial_state のみ保持されていること
        with fail_engine.connect() as conn:
            rows = conn.execute(sa.text("SELECT val FROM test_table;")).fetchall()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0][0], "initial_state")

