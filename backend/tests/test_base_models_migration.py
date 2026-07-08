import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app import models
from app.seeder import seed_initial_data, _seed_base_models, _migrate_existing_loras

class TestBaseModelsMigration(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
        self.connection = self.engine.connect()
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.connection)
        Base.metadata.create_all(bind=self.connection)
        self.db = self.SessionLocal()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.connection)
        self.connection.close()

    def test_base_model_crud(self):
        bm = models.BaseModel(name='TestModel', description='Test Desc')
        self.db.add(bm)
        self.db.commit()
        self.db.refresh(bm)
        self.assertIsNotNone(bm.id)
        self.assertEqual(bm.name, 'TestModel')
        self.assertEqual(bm.description, 'Test Desc')
        retrieved = self.db.query(models.BaseModel).filter(models.BaseModel.id == bm.id).first()
        self.assertEqual(retrieved.name, 'TestModel')

    def test_checkpoint_mapping_crud(self):
        bm = models.BaseModel(name='Anima', description='Anime Style')
        self.db.add(bm)
        self.db.commit()
        mapping = models.CheckpointMapping(checkpoint_name='anime_style_v3.safetensors', base_model_id=bm.id)
        self.db.add(mapping)
        self.db.commit()
        self.db.refresh(mapping)
        self.assertIsNotNone(mapping.id)
        self.assertEqual(mapping.checkpoint_name, 'anime_style_v3.safetensors')
        self.assertEqual(mapping.base_model.name, 'Anima')

    def test_seed_initial_data_populates_base_models(self):
        seed_initial_data(self.db)
        base_models = self.db.query(models.BaseModel).all()
        names = [bm.name for bm in base_models]
        self.assertIn('Illus', names)
        self.assertIn('Noob', names)
        self.assertIn('Anima', names)

    def test_lora_many_to_many_base_models(self):
        illus = models.BaseModel(name='Illus')
        noob = models.BaseModel(name='Noob')
        self.db.add_all([illus, noob])
        self.db.commit()
        lora = models.Lora(model_name='Test Lora')
        lora.base_models.append(illus)
        lora.base_models.append(noob)
        self.db.add(lora)
        self.db.commit()
        self.db.refresh(lora)
        self.assertEqual(len(lora.base_models), 2)
        model_names = [bm.name for bm in lora.base_models]
        self.assertIn('Illus', model_names)
        self.assertIn('Noob', model_names)
        self.db.refresh(illus)
        self.assertEqual(len(illus.loras), 1)
        self.assertEqual(illus.loras[0].model_name, 'Test Lora')

    def test_existing_lora_migration_to_illus(self):
        _seed_base_models(self.db)
        lora = models.Lora(model_name='Legacy Lora')
        self.db.add(lora)
        self.db.commit()
        self.db.refresh(lora)
        self.assertEqual(len(lora.base_models), 0)
        _migrate_existing_loras(self.db)
        self.db.refresh(lora)
        self.assertEqual(len(lora.base_models), 1)
        self.assertEqual(lora.base_models[0].name, 'Illus')

    def test_workflow_base_model_relation(self):
        bm = models.BaseModel(name='Noob')
        self.db.add(bm)
        self.db.commit()
        workflow = models.Workflow(name='test_workflow', json_body='{}', target_base_model_id=bm.id)
        self.db.add(workflow)
        self.db.commit()
        self.db.refresh(workflow)
        self.assertEqual(workflow.target_base_model_id, bm.id)
        self.assertEqual(workflow.target_base_model.name, 'Noob')
