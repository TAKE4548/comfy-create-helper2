"""Seed data constants for database initialization."""

MAPPING_MASTER_SEEDS = [
    {
        "role": "Main_Positive_Prompt",
        "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"],
        "param_name": "text",
        "input_type": "textarea",
        "display_name": "Main positive prompt",
        "title_patterns": ["MainPrompt", "Main_positive", "Main_Positive_Prompt"],
    },
    {
        "role": "Face_Positive_Prompt",
        "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"],
        "param_name": "text",
        "input_type": "textarea",
        "display_name": "Face positive prompt",
        "title_patterns": ["FacePrompt", "Face_positive", "Face_Positive_Prompt"],
    },
    {
        "role": "Negative_Prompt",
        "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"],
        "param_name": "text",
        "input_type": "textarea",
        "display_name": "Negative prompt",
        "title_patterns": ["Main_negative", "Negative_Prompt"],
    },
    {
        "role": "Sampler_Seed",
        "expected_class_types": ["KSampler", "KSamplerAdvanced"],
        "param_name": "seed",
        "input_type": "int",
        "display_name": "Sampler Seed",
        "title_patterns": ["MainSampler", "Sampler_Seed"],
    },
    {
        "role": "Sampler_Steps",
        "expected_class_types": ["KSampler", "KSamplerAdvanced"],
        "param_name": "steps",
        "input_type": "int",
        "display_name": "Sampler Steps",
        "title_patterns": ["MainSampler", "Sampler_Steps"],
    },
    {
        "role": "Sampler_cfg",
        "expected_class_types": ["KSampler", "KSamplerAdvanced"],
        "param_name": "cfg",
        "input_type": "float",
        "display_name": "Sampler CFG",
        "title_patterns": ["MainSampler", "Sampler_cfg"],
    },
    {
        "role": "Sampler_denoise",
        "expected_class_types": ["KSampler", "KSamplerAdvanced"],
        "param_name": "denoise",
        "input_type": "float",
        "display_name": "Sampler Denoise",
        "title_patterns": ["MainSampler", "Sampler_denoise"],
    },
    {
        "role": "Prompt_Quality",
        "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"],
        "param_name": "text",
        "input_type": "textarea",
        "display_name": "Quality Tags",
        "title_patterns": ["QualityPrompt", "Prompt_Quality", "Quality"],
    },
    {
        "role": "Prompt_Core",
        "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"],
        "param_name": "text",
        "input_type": "textarea",
        "display_name": "Core Settings",
        "title_patterns": ["CorePrompt", "Prompt_Core", "CoreSettings"],
    },
    {
        "role": "Prompt_Char_Series",
        "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"],
        "param_name": "text",
        "input_type": "textarea",
        "display_name": "Character / Series",
        "title_patterns": ["CharSeriesPrompt", "Prompt_Char_Series", "Character"],
    },
    {
        "role": "Prompt_Char_Lora_Face",
        "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"],
        "param_name": "text",
        "input_type": "textarea",
        "display_name": "Character LoRA Face",
        "title_patterns": [
            "Prompt_Char_Lora_Face", "Prompt_Char_Lora_Face_Prompt",
            "Char_Lora_Face", "CharLoraFacePrompt", "CharLoraFace", "CharLora_Face",
        ],
    },
    {
        "role": "Prompt_Char_Lora_Other",
        "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"],
        "param_name": "text",
        "input_type": "textarea",
        "display_name": "Character LoRA Other",
        "title_patterns": [
            "Prompt_Char_Lora_Other", "Prompt_Char_Lora_Other_Prompt",
            "Char_Lora_Other", "CharLoraOtherPrompt", "CharLoraOther", "CharLora_Other",
        ],
    },
    {
        "role": "Prompt_Char_Body_Outfit",
        "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"],
        "param_name": "text",
        "input_type": "textarea",
        "display_name": "Body & Outfit",
        "title_patterns": ["BodyOutfitPrompt", "Prompt_Char_Body_Outfit", "Body"],
    },
    {
        "role": "Prompt_Pose_Action",
        "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"],
        "param_name": "text",
        "input_type": "textarea",
        "display_name": "Pose & Action",
        "title_patterns": ["PoseActionPrompt", "Prompt_Pose_Action", "Pose"],
    },
    {
        "role": "Prompt_Expression",
        "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"],
        "param_name": "text",
        "input_type": "textarea",
        "display_name": "Expression",
        "title_patterns": ["ExpressionPrompt", "Prompt_Expression", "Expression"],
    },
    {
        "role": "Prompt_Composition",
        "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"],
        "param_name": "text",
        "input_type": "textarea",
        "display_name": "Composition",
        "title_patterns": ["CompositionPrompt", "Prompt_Composition", "Composition"],
    },
    {
        "role": "Prompt_Background_Environment",
        "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"],
        "param_name": "text",
        "input_type": "textarea",
        "display_name": "Background & Environment",
        "title_patterns": ["BackgroundPrompt", "Prompt_Background_Environment", "Background"],
    },
    {
        "role": "Prompt_Lighting",
        "expected_class_types": ["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"],
        "param_name": "text",
        "input_type": "textarea",
        "display_name": "Lighting",
        "title_patterns": ["LightingPrompt", "Prompt_Lighting", "Lighting"],
    },
    {
        "role": "Character_Lora_Model",
        "expected_class_types": ["LoraLoader"],
        "param_name": "lora_name",
        "input_type": "select",
        "display_name": "Character LoRA Model",
        "title_patterns": ["LoraName", "lora_name", "Character_Lora"],
    },
    {
        "role": "Character_Lora_Strength_Model",
        "expected_class_types": ["LoraLoader"],
        "param_name": "strength_model",
        "input_type": "float",
        "display_name": "Character LoRA Strength (Model)",
        "title_patterns": ["LoraStrengthModel", "strength_model"],
    },
    {
        "role": "FDetailer_Steps",
        "expected_class_types": ["FaceDetailer"],
        "param_name": "steps",
        "input_type": "int",
        "display_name": "FaceDetailer Steps",
        "title_patterns": ["FaceDetailer", "FDetailer_Steps"],
    },
    {
        "role": "FDetailer_cfg",
        "expected_class_types": ["FaceDetailer"],
        "param_name": "cfg",
        "input_type": "float",
        "display_name": "FaceDetailer CFG",
        "title_patterns": ["FaceDetailer", "FDetailer_cfg"],
    },
    {
        "role": "FDetailer_denoise",
        "expected_class_types": ["FaceDetailer"],
        "param_name": "denoise",
        "input_type": "float",
        "display_name": "FaceDetailer Denoise",
        "title_patterns": ["FaceDetailer", "FDetailer_denoise"],
    },
]

LLM_PROMPT_SEEDS = [
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
    {
        "key": "scene_generate",
        "description": "Scene Generator用システムプロンプト",
        "content": (
            "You are a scene description expert for AI image generation.\n"
            "Given a scene summary in Japanese and a list of candidate fields with their current values,\n"
            "analyze the scene and generate English prompts ONLY for the fields that are relevant to the scene.\n"
            "You decide which fields to update based on the scene's natural implication.\n\n"
            "Rules:\n"
            "1. Output MUST be a valid JSON array — no markdown, no explanation outside JSON.\n"
            "2. Only include fields you want to change; omit unchanged fields.\n"
            "3. Each field value must be comma-separated English prompt tags (no Japanese, no full sentences).\n"
            "4. Do NOT hallucinate fields that are not listed in target_fields."
        ),
    },
]

LORA_CATEGORY_SEEDS = ["キャラクター系", "ポーズ再現系", "スタイル系", "コンセプト系"]

TAGSET_CATEGORY_SEEDS = ["キャラクター系", "ポーズ・行動系", "構図・画角系", "表情系", "背景・環境系"]

# Workflow ID=1 mapping corrections (project-specific one-time fix)
WORKFLOW_1_MAPPING_CORRECTIONS = {
    "366:344": "Prompt_Char_Lora_Face",
    "366:345": "Prompt_Char_Lora_Other",
    "366:361": "Prompt_Composition",
    "366:351": "Prompt_Background_Environment",
}
