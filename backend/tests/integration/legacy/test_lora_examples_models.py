import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Base, Lora, LoraExampleImage


@pytest.fixture
def session_factory():
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    yield Session, engine
    engine.dispose()


def test_example_images_persist_in_order_and_cascade_without_affecting_other_loras(session_factory):
    SessionFactory, engine = session_factory
    with SessionFactory(engine) as session:
        first = Lora(model_name="first.safetensors")
        other = Lora(model_name="other.safetensors")
        first.example_images = [
            LoraExampleImage(image_path="/uploads/second.png", sort_order=2),
            LoraExampleImage(image_path="/uploads/first.png", sort_order=1),
        ]
        other.example_images = [LoraExampleImage(image_path="/uploads/other.png", sort_order=0)]
        session.add_all([first, other])
        session.commit()
        first_id, other_id = first.id, other.id

    with SessionFactory(engine) as session:
        first = session.get(Lora, first_id)
        assert first is not None
        assert [image.image_path for image in first.example_images] == ["/uploads/first.png", "/uploads/second.png"]
        removed = first.example_images[0]
        session.delete(removed)
        session.commit()

    with SessionFactory(engine) as session:
        first = session.get(Lora, first_id)
        assert first is not None
        assert [image.image_path for image in first.example_images] == ["/uploads/second.png"]
        session.delete(first)
        session.commit()

    with SessionFactory(engine) as session:
        assert session.get(Lora, first_id) is None
        remaining = session.scalars(select(LoraExampleImage).where(LoraExampleImage.lora_id == other_id)).all()
        assert [image.image_path for image in remaining] == ["/uploads/other.png"]


def test_example_image_path_must_not_be_empty(session_factory):
    SessionFactory, engine = session_factory
    with SessionFactory(engine) as session:
        lora = Lora(model_name="empty-path.safetensors")
        lora.example_images.append(LoraExampleImage(image_path=""))
        session.add(lora)
        with pytest.raises(IntegrityError):
            session.commit()
