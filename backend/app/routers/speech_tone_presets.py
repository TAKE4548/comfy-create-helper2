from pathlib import Path
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app import models, schemas
from app.services.llm_request import call_llm, load_image_as_base64

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/speech-tone-presets", tags=["speech-tone-presets"])


@router.get("", response_model=list[schemas.SpeechTonePresetRead])
def list_speech_tone_presets(db: Session = Depends(get_db)):
    return (
        db.query(models.SpeechTonePreset)
        .order_by(models.SpeechTonePreset.sort_order.asc(), models.SpeechTonePreset.id.asc())
        .all()
    )


@router.post("", response_model=schemas.SpeechTonePresetRead, status_code=status.HTTP_201_CREATED)
def create_speech_tone_preset(payload: schemas.SpeechTonePresetCreate, db: Session = Depends(get_db)):
    existing = db.query(models.SpeechTonePreset).filter(models.SpeechTonePreset.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Preset with this name already exists")
    preset = models.SpeechTonePreset(
        name=payload.name,
        prompt=payload.prompt,
        description=payload.description,
        sort_order=payload.sort_order,
    )
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return preset


@router.put("/{preset_id}", response_model=schemas.SpeechTonePresetRead)
def update_speech_tone_preset(preset_id: int, payload: schemas.SpeechTonePresetUpdate, db: Session = Depends(get_db)):
    preset = db.query(models.SpeechTonePreset).filter(models.SpeechTonePreset.id == preset_id).first()
    if not preset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preset not found")
    if payload.name is not None and payload.name != preset.name:
        existing = db.query(models.SpeechTonePreset).filter(
            models.SpeechTonePreset.name == payload.name,
            models.SpeechTonePreset.id != preset_id
        ).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Preset with this name already exists")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(preset, k, v)
    db.commit()
    db.refresh(preset)
    return preset


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_speech_tone_preset(preset_id: int, db: Session = Depends(get_db)):
    preset = db.query(models.SpeechTonePreset).filter(models.SpeechTonePreset.id == preset_id).first()
    if not preset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preset not found")
    db.delete(preset)
    db.commit()
    return None


@router.post("/rewrite", response_model=schemas.SpeechToneRewriteResponse)
async def rewrite_speech(payload: schemas.SpeechToneRewriteRequest, db: Session = Depends(get_db)):
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Text is required")
    tone_prompt = payload.tone_prompt
    if not tone_prompt and payload.preset_id:
        preset = db.query(models.SpeechTonePreset).filter(models.SpeechTonePreset.id == payload.preset_id).first()
        if preset:
            tone_prompt = preset.prompt
    if not tone_prompt or not tone_prompt.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tone prompt or valid preset_id is required")

    system_prompt = (
        "あなたはセリフの言い回しや口調を変換する専門家です。\n"
        "元のセリフの意味、状況、感情、意図は一切変えずに、指定された口調・話し方・キャラクター特徴に合わせて自然なセリフに書き換えてください。\n\n"
        "【ルール】\n"
        "1. セリフの意味内容・文脈・伝達したい情報は忠実に維持すること。\n"
        "2. 指定された口調、語尾、一人称・二人称、キャラクターの性格ニュアンスを的確に反映すること。\n"
        "3. 出力は書き換えたセリフのみを返してください。挨拶、前置き、引用符（「」等）、解説は一切含めないでください。"
    )

    user_prompt_parts = [
        f"【口調・キャラクター設定】\n{tone_prompt}",
        f"【元のセリフ】\n{payload.text}"
    ]

    if payload.scene_hint and payload.scene_hint.strip():
        user_prompt_parts.append(f"【場面の状況・ヒント】\n{payload.scene_hint.strip()}")

    image_b64 = None
    if payload.include_image:
        image_file_path = None
        if payload.image_path:
            filename = payload.image_path.split("/")[-1]
            candidate = Path(settings.snapshot_path) / filename
            if candidate.exists():
                image_file_path = candidate
            elif Path(payload.image_path).exists():
                image_file_path = Path(payload.image_path)
        elif payload.snapshot_id:
            s = db.query(models.Snapshot).filter(models.Snapshot.id == payload.snapshot_id).first()
            if s and s.image_path:
                filename = s.image_path.split("/")[-1]
                candidate = Path(settings.snapshot_path) / filename
                if candidate.exists():
                    image_file_path = candidate

        if image_file_path:
            try:
                image_b64 = load_image_as_base64(image_file_path)
                user_prompt_parts.append(
                    "※画像が添付されています。画像内のキャラクターの表情、視線、シチュエーション、場面の雰囲気を読み取って、その状況に最も適した感情・トーン・ニュアンスをセリフに反映してください。"
                )
            except Exception as e:
                logger.warning(f"Failed to load image for multimodal rewrite: {e}")

    user_prompt = "\n\n".join(user_prompt_parts)

    try:
        res = await call_llm(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=payload.model,
            llm_params=payload.llm_params,
            image_data=image_b64,
        )
        return schemas.SpeechToneRewriteResponse(rewritten_text=res.strip().strip('"').strip('「').strip('」'))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
