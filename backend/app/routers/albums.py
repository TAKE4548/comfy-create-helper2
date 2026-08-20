"""Albums router."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/albums", tags=["albums"])


@router.get("", response_model=list[schemas.AlbumRead])
def list_albums(db: Session = Depends(get_db)):
    albums = db.query(models.Album).order_by(models.Album.sort_order.asc(), models.Album.id.asc()).all()
    return [
        schemas.AlbumRead(
            id=album.id,
            name=album.name,
            sort_order=album.sort_order,
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
        sort_order=album.sort_order,
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
    max_order = db.query(func.max(models.Album.sort_order)).scalar()
    next_order = (max_order + 1) if max_order is not None else 0
    album = models.Album(name=payload.name, sort_order=next_order)
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


@router.put("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_albums(payload: schemas.AlbumReorder, db: Session = Depends(get_db)):
    for i, aid in enumerate(payload.ordered_ids):
        db.query(models.Album).filter(models.Album.id == aid).update({"sort_order": i})
    db.commit()


@router.put("/{album_id}", response_model=schemas.AlbumRead)
def update_album(album_id: int, payload: schemas.AlbumUpdate, db: Session = Depends(get_db)):
    album = db.query(models.Album).filter(models.Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    
    if payload.name is not None:
        trimmed_name = payload.name.strip()
        if not trimmed_name:
            raise HTTPException(status_code=400, detail="Album name cannot be empty")
        
        existing = db.query(models.Album).filter(
            models.Album.name == trimmed_name,
            models.Album.id != album_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Album with this name already exists")
        
        album.name = trimmed_name

    if payload.sort_order is not None:
        album.sort_order = payload.sort_order

    db.commit()
    db.refresh(album)
    return get_album(album_id, db)


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


@router.post("/{album_id}/items", response_model=schemas.AlbumRead)
def add_album_items(
    album_id: int,
    payload: schemas.AlbumItemsAdd,
    db: Session = Depends(get_db)
):
    album = db.query(models.Album).filter(models.Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
        
    # Get current max sequence_order
    max_order = db.query(func.max(models.AlbumItem.sequence_order)).filter(
        models.AlbumItem.album_id == album_id
    ).scalar()
    next_order = (max_order + 1) if max_order is not None else 0
    
    # Add new items that are not already in the album
    existing_snap_ids = {item.snapshot_id for item in album.items}
    for snap_id in payload.snapshot_ids:
        if snap_id not in existing_snap_ids:
            db.add(models.AlbumItem(
                album_id=album_id,
                snapshot_id=snap_id,
                sequence_order=next_order
            ))
            next_order += 1
            
    db.commit()
    db.refresh(album)
    return get_album(album_id, db)

