"""FastAPI application entry point."""

import json
import logging
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import engine, SessionLocal
from app import models
from app.routers import (
    workflows, mapping_masters, snapshots, albums,
    loras, tag_sets, categories, audit, llm_prompts,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def seed_initial_data(db):
    """Insert initial data if tables are empty."""
    # ─── Mapping Master seed data ─────────────────────────────────
    if db.query(models.MappingMaster).count() == 0:
        masters = [
            {"role": "Main_Positive_Prompt", "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"], "param_name": "text", "input_type": "textarea", "display_name": "Main positive prompt", "title_patterns": ["MainPrompt", "Main_positive", "Main_Positive_Prompt"]},
            {"role": "Face_Positive_Prompt", "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"], "param_name": "text", "input_type": "textarea", "display_name": "Face positive prompt", "title_patterns": ["FacePrompt", "Face_positive", "Face_Positive_Prompt"]},
            {"role": "Negative_Prompt", "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"], "param_name": "text", "input_type": "textarea", "display_name": "Negative prompt", "title_patterns": ["Main_negative", "Negative_Prompt"]},
            {"role": "Sampler_Seed", "expected_class_types": ["KSampler", "KSamplerAdvanced"], "param_name": "seed", "input_type": "int", "display_name": "Sampler Seed", "title_patterns": ["MainSampler", "Sampler_Seed"]},
            {"role": "Sampler_Steps", "expected_class_types": ["KSampler", "KSamplerAdvanced"], "param_name": "steps", "input_type": "int", "display_name": "Sampler Steps", "title_patterns": ["MainSampler", "Sampler_Steps"]},
            {"role": "Sampler_cfg", "expected_class_types": ["KSampler", "KSamplerAdvanced"], "param_name": "cfg", "input_type": "float", "display_name": "Sampler CFG", "title_patterns": ["MainSampler", "Sampler_cfg"]},
            {"role": "Sampler_denoise", "expected_class_types": ["KSampler", "KSamplerAdvanced"], "param_name": "denoise", "input_type": "float", "display_name": "Sampler Denoise", "title_patterns": ["MainSampler", "Sampler_denoise"]},
            {"role": "Prompt_Quality", "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"], "param_name": "text", "input_type": "textarea", "display_name": "Quality Tags", "title_patterns": ["QualityPrompt", "Prompt_Quality", "Quality"]},
            {"role": "Prompt_Core", "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"], "param_name": "text", "input_type": "textarea", "display_name": "Core Settings", "title_patterns": ["CorePrompt", "Prompt_Core", "CoreSettings"]},
            {"role": "Prompt_Char_Series", "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"], "param_name": "text", "input_type": "textarea", "display_name": "Character / Series", "title_patterns": ["CharSeriesPrompt", "Prompt_Char_Series", "Character"]},
            {"role": "Prompt_Char_Body_Outfit", "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"], "param_name": "text", "input_type": "textarea", "display_name": "Body & Outfit", "title_patterns": ["BodyOutfitPrompt", "Prompt_Char_Body_Outfit", "Body"]},
            {"role": "Prompt_Pose_Action", "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"], "param_name": "text", "input_type": "textarea", "display_name": "Pose & Action", "title_patterns": ["PoseActionPrompt", "Prompt_Pose_Action", "Pose"]},
            {"role": "Prompt_Expression", "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"], "param_name": "text", "input_type": "textarea", "display_name": "Expression", "title_patterns": ["ExpressionPrompt", "Prompt_Expression", "Expression"]},
            {"role": "Prompt_Composition", "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"], "param_name": "text", "input_type": "textarea", "display_name": "Composition", "title_patterns": ["CompositionPrompt", "Prompt_Composition", "Composition"]},
            {"role": "Prompt_Background_Environment", "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"], "param_name": "text", "input_type": "textarea", "display_name": "Background & Environment", "title_patterns": ["BackgroundPrompt", "Prompt_Background_Environment", "Background"]},
            {"role": "Prompt_Lighting", "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"], "param_name": "text", "input_type": "textarea", "display_name": "Lighting", "title_patterns": ["LightingPrompt", "Prompt_Lighting", "Lighting"]},
            {"role": "Character_Lora_Model", "expected_class_types": ["LoraLoader"], "param_name": "lora_name", "input_type": "select", "display_name": "Character LoRA Model", "title_patterns": ["LoraName", "lora_name", "Character_Lora"]},
            {"role": "Character_Lora_Strength_Model", "expected_class_types": ["LoraLoader"], "param_name": "strength_model", "input_type": "float", "display_name": "Character LoRA Strength (Model)", "title_patterns": ["LoraStrengthModel", "strength_model"]},
            {"role": "FDetailer_Steps", "expected_class_types": ["FaceDetailer"], "param_name": "steps", "input_type": "int", "display_name": "FaceDetailer Steps", "title_patterns": ["FaceDetailer", "FDetailer_Steps"]},
            {"role": "FDetailer_cfg", "expected_class_types": ["FaceDetailer"], "param_name": "cfg", "input_type": "float", "display_name": "FaceDetailer CFG", "title_patterns": ["FaceDetailer", "FDetailer_cfg"]},
            {"role": "FDetailer_denoise", "expected_class_types": ["FaceDetailer"], "param_name": "denoise", "input_type": "float", "display_name": "FaceDetailer Denoise", "title_patterns": ["FaceDetailer", "FDetailer_denoise"]},
        ]
        for m in masters:
            db.add(models.MappingMaster(
                role=m["role"],
                expected_class_types=json.dumps(m["expected_class_types"]),
                param_name=m["param_name"],
                input_type=m["input_type"],
                display_name=m["display_name"],
                title_patterns=json.dumps(m["title_patterns"]),
            ))
        logger.info("Seeded mapping_master table.")

    # ─── LLM Prompts seed ─────────────────────────────────────────
    if db.query(models.LlmPrompt).count() == 0:
        llm_seeds = [
            {
                "key": "audit_interference",
                "description": "干渉タグ診断用（SDXL/汎用）",
                "content": (
                    "You are 'Prompt Surgeon', an expert AI image generation consultant.\n\n"
                    "<task>\n"
                    "Diagnose Danbooru-style tags in a prompt that interfere with the user's intent.\n"
                    "Provide insights for the user to make the final decision. DO NOT rewrite the entire prompt.\n"
                    "</task>\n\n"
                    "<criteria>\n"
                    "1. Composition vs. Details: 'close-up' intent heavily conflicts with lower-body tags like 'socks' or 'shoes'.\n"
                    "2. Contradictory States: Conflicting postures (e.g., 'standing' vs 'sitting') or lighting.\n"
                    "3. Focus: Tags that dilute the user's main subject.\n"
                    "</criteria>\n\n"
                    "<output_format>\n"
                    "Your final output MUST be strictly enclosed in the following XML tags. Do not output any conversational filler, explanation outside the tags, or markdown code blocks.\n\n"
                    "<remove_tags>\n"
                    "  <item>\n"
                    "    <tag>tag_name</tag>\n"
                    "    <reason_jp>clear_reason_in_japanese</reason_jp>\n"
                    "  </item>\n"
                    "</remove_tags>\n"
                    "</output_format>"
                ),
            },
            {
                "key": "audit_interference_anima",
                "description": "干渉タグ診断用（Anima / 自然言語対応モデル）",
                "content": (
                    "You are 'Prompt Surgeon', an expert AI image generation consultant.\n\n"
                    "<task>\n"
                    "Diagnose tags and natural language expressions in a prompt that interfere with the user's intent.\n"
                    "Provide insights for the user to make the final decision. DO NOT rewrite the entire prompt.\n"
                    "</task>\n\n"
                    "<criteria>\n"
                    "1. Composition vs. Details: 'close-up' intent heavily conflicts with lower-body tags/phrases like 'socks' or 'shoes'.\n"
                    "2. Contradictory States: Conflicting postures (e.g., 'standing' vs 'sitting') or lighting.\n"
                    "3. Focus: Phrases/tags that dilute the user's main subject.\n"
                    "4. Mixed Formats: Check if the mixture of tag sequences and natural language sentences creates logical confusion.\n"
                    "</criteria>\n\n"
                    "<output_format>\n"
                    "Your final output MUST be strictly enclosed in the following XML tags. Do not output any conversational filler, explanation outside the tags, or markdown code blocks.\n\n"
                    "<remove_tags>\n"
                    "  <item>\n"
                    "    <tag>tag_name_or_phrase</tag>\n"
                    "    <reason_jp>clear_reason_in_japanese</reason_jp>\n"
                    "  </item>\n"
                    "</remove_tags>\n"
                    "</output_format>"
                ),
            },
            {
                "key": "audit_vocabulary",
                "description": "語彙サジェスト用（SDXL/汎用）",
                "content": (
                    "You are Prompt Surgeon, an expert assistant in AI image generation.\n"
                    "Suggest additional Danbooru-style tags in English based on the user's intention.\n"
                    "Your final output MUST be strictly enclosed in the following XML tags. Do not output any conversational filler, explanation outside the tags, or markdown code blocks.\n\n"
                    "<suggestions>\n"
                    "  <item>\n"
                    "    <vocabulary>tag_in_english</vocabulary>\n"
                    "    <effect_jp>effect_description_in_japanese</effect_jp>\n"
                    "  </item>\n"
                    "</suggestions>"
                ),
            },
            {
                "key": "audit_physical",
                "description": "物理・構図整合性チェック用",
                "content": (
                    "You are Prompt Surgeon, an expert assistant in AI image generation.\n"
                    "Evaluate if the combination of pose, composition, and subjects in the prompt is physically and logically consistent.\n"
                    "Your final output MUST be strictly enclosed in the following XML tags. Do not output any conversational filler, explanation outside the tags, or markdown code blocks.\n\n"
                    "<evaluation>\n"
                    "  <rating>OK or Warning or Conflict</rating>\n"
                    "  <reason_jp>reason_description_in_japanese</reason_jp>\n"
                    "  <alternatives>\n"
                    "    <item>alternative_recommendation_1</item>\n"
                    "    <item>alternative_recommendation_2</item>\n"
                    "  </alternatives>\n"
                    "</evaluation>"
                ),
            },
        ]
        for seed in llm_seeds:
            db.add(models.LlmPrompt(
                key=seed["key"],
                content=seed["content"],
                description=seed["description"],
                updated_at=datetime.utcnow(),
            ))
        logger.info("Seeded llm_prompts table.")

    # ─── Default categories ───────────────────────────────────────
    if db.query(models.LoraCategory).count() == 0:
        for name in ["キャラクター系", "ポーズ再現系", "スタイル系", "コンセプト系"]:
            db.add(models.LoraCategory(name=name))
        logger.info("Seeded lora_categories table.")

    if db.query(models.TagsetCategory).count() == 0:
        for name in ["キャラクター系", "ポーズ・行動系", "構図・画角系", "表情系", "背景・環境系"]:
            db.add(models.TagsetCategory(name=name))
        logger.info("Seeded tagset_categories table.")

    db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables and seed data on startup
    models.Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()
    logger.info("Prompt Surgeon API started.")
    yield
    logger.info("Prompt Surgeon API shutting down.")


app = FastAPI(
    title="Prompt Surgeon API",
    description="ComfyUI workflow management and LLM audit relay API.",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(workflows.router)
app.include_router(mapping_masters.router)
app.include_router(snapshots.router)
app.include_router(albums.router)
app.include_router(loras.router)
app.include_router(tag_sets.router)
app.include_router(categories.lora_router)
app.include_router(categories.tagset_router)
app.include_router(audit.router)
app.include_router(llm_prompts.router)


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/api/config")
def get_config():
    return {"comfy_url": settings.comfy_url}

