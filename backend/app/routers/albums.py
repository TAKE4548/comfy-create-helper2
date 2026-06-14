"""Albums router."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/albums", tags=["albums"])


@router.get("", response_model=list[schemas.AlbumRead])
def list_albums(db: Session = Depends(get_db)):
    albums = db.query(models.Album).order_by(models.Album.name).all()
    return [
        schemas.AlbumRead(
            id=album.id,
            name=album.name,
            created_at=album.created_at,
            items=[
                schemas.AlbumItemRead(
                    snapshot_id=item.snapshot_id,
                    sequence_order=item.sequence_order,
                    image_path=item.snapshot.image_path if item.snapshot else None,
                    created_at=item.snapshot.created_at if item.snapshot else None,
                )
                for item in sorted(album.items, key=lambda x: x.sequence_order)
            ],
        )
        for album in albums
    ]


@router.get("/{album_id}", response_model=schemas.AlbumRead)
def get_album(album_id: int, db: Session = Depends(get_db)):
    album = db.query(models.Album).filter(models.Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    return schemas.AlbumRead(
        id=album.id,
        name=album.name,
        created_at=album.created_at,
        items=[
            schemas.AlbumItemRead(
                snapshot_id=item.snapshot_id,
                sequence_order=item.sequence_order,
                image_path=item.snapshot.image_path if item.snapshot else None,
                created_at=item.snapshot.created_at if item.snapshot else None,
            )
            for item in sorted(album.items, key=lambda x: x.sequence_order)
        ],
    )


@router.post("", response_model=schemas.AlbumSummary, status_code=status.HTTP_201_CREATED)
def create_album(payload: schemas.AlbumCreate, db: Session = Depends(get_db)):
    album = models.Album(name=payload.name)
    db.add(album)
    db.flush()
    for idx, snap_id in enumerate(payload.snapshot_ids):
        db.add(models.AlbumItem(
            album_id=album.id,
            snapshot_id=snap_id,
            sequence_order=idx,
        ))
    db.commit()
    db.refresh(album)
    return album


@router.put("/{album_id}/order", response_model=schemas.AlbumRead)
def update_album_order(album_id: int, payload: schemas.AlbumOrderUpdate, db: Session = Depends(get_db)):
    album = db.query(models.Album).filter(models.Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    for idx, snap_id in enumerate(payload.snapshot_ids):
        item = db.query(models.AlbumItem).filter(
            models.AlbumItem.album_id == album_id,
            models.AlbumItem.snapshot_id == snap_id,
        ).first()
        if item:
            item.sequence_order = idx
    db.commit()
    db.refresh(album)
    return get_album(album_id, db)


@router.delete("/{album_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_album(album_id: int, db: Session = Depends(get_db)):
    album = db.query(models.Album).filter(models.Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    db.delete(album)
    db.commit()


@router.post("/{album_id}/items/delete", response_model=schemas.AlbumRead)
def delete_album_items(
    album_id: int, 
    payload: schemas.AlbumItemsDelete, 
    db: Session = Depends(get_db)
) -> schemas.AlbumRead:
    album = db.query(models.Album).filter(models.Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
        
    # 指定された snapshot_ids に一致する AlbumItem レコードを削除
    db.query(models.AlbumItem).filter(
        models.AlbumItem.album_id == album_id,
        models.AlbumItem.snapshot_id.in_(payload.snapshot_ids)
    ).delete(synchronize_session=False)
    
    db.flush()
    
    # 残ったアルバムアイテムを取得し、元の sequence_order でソートしてインデックスを 0 から順に再割り当て
    remaining_items = db.query(models.AlbumItem).filter(
        models.AlbumItem.album_id == album_id
    ).order_by(models.AlbumItem.sequence_order).all()
    
    for idx, item in enumerate(remaining_items):
        item.sequence_order = idx
        
    db.commit()
    db.refresh(album)
    return get_album(album_id, db)
