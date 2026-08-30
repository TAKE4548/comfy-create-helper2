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
    {
        "key": "scene_generate_anima",
        "description": "Scene Generator用システムプロンプト（Animaモード）",
        "content": (
            "You are an expert translator and scene interpreter for AI image generation with Anima (Qwen-CLIP based model).\n"
            "Given a scene summary written in Japanese (may include some English), translate and expand it into\n"
            "descriptive, natural English expressions that Anima's CLIP encoder interprets well.\n"
            "Anima excels at understanding natural language descriptions, NOT just comma-separated Danbooru tags.\n\n"
            "Rules:\n"
            "1. Output MUST be a valid JSON array — no markdown, no explanation outside JSON.\n"
            "2. Only include fields you want to change; omit unchanged fields.\n"
            "3. Use descriptive English phrases and sentences, not just comma-separated short tags.\n"
            "4. Preserve the nuances and atmosphere of the Japanese input.\n"
            "5. Do NOT hallucinate fields that are not listed in target_fields."
        ),
    },
    {
        "key": "translation_ja_to_en",
        "description": "翻訳システムプロンプト (日 -> 英)",
        "content": (
            "You are a professional prompt translator for AI image generation. "
            "Translate the following Japanese text into natural, descriptive English prompt. "
            "Output ONLY the translated English prompt. Do not output any chat dialog or explanations."
        )
    },
    {
        "key": "translation_en_to_ja",
        "description": "翻訳システムプロンプト (英 -> 日)",
        "content": (
            "あなたはAI画像生成プロンプトの専門翻訳者です。与えられた英語のプロンプトを、自然な日本語に翻訳してください。翻訳結果のみを出力し、挨拶や余計な解説は一切含めないでください。"
        )
    },
    {
        "key": "translation_model",
        "description": "翻訳用LLMモデル名（空の場合はメインモデルを使用）",
        "content": ""
    },
    {
        "key": "translation_debounce",
        "description": "翻訳のデバウンス間隔（ミリ秒）",
        "content": "500"
    },
    {
        "key": "llm_params_translation",
        "description": "翻訳用LLM詳細パラメータ",
        "content": '{"temperature": 0.2, "top_p": 1.0, "max_tokens": 1000, "presence_penalty": 0.0, "frequency_penalty": 0.0}'
    },
    {
        "key": "translation_provider",
        "description": "翻訳プロバイダー (google_cloud, deepl, llm)",
        "content": "google_cloud"
    },
    {
        "key": "translation_api_key",
        "description": "翻訳プロバイダー用APIキー",
        "content": ""
    },
    {
        "key": "translation_api_url",
        "description": "翻訳プロバイダー用カスタムAPIエンドポイントURL",
        "content": ""
    },
    {
        "key": "llm_params_scene_generate",
        "description": "Scene Generator用LLM詳細パラメータ",
        "content": '{"temperature": 0.2, "top_p": 1.0, "max_tokens": 1000, "presence_penalty": 0.0, "frequency_penalty": 0.0}'
    },
    {
        "key": "llm_params_audit",
        "description": "プロンプト診断用LLM詳細パラメータ",
        "content": '{"temperature": 0.2, "top_p": 1.0, "max_tokens": 1000, "presence_penalty": 0.0, "frequency_penalty": 0.0}'
    },
    {
        "key": "speech_draft_vlm_model",
        "description": "セリフ下書き VLM モデル名",
        "content": ""
    },
    {
        "key": "speech_draft_vlm_prompt",
        "description": "セリフ下書き VLM システムプロンプト",
        "content": "この画像のキャラクターや状況を簡潔に日本語で説明してください。"
    },
    {
        "key": "speech_draft_llm_model",
        "description": "セリフ下書き LLM モデル名",
        "content": ""
    },
    {
        "key": "speech_draft_llm_prompt",
        "description": "セリフ下書き LLM システムプロンプト",
        "content": "あなたはマンガのセリフ作家です。以下の画像の説明と生成プロンプトを元に、キャラクターが話しそうな自然なセリフを1~2文で生成してください。セリフのみを出力してください。"
    },
    {
        "key": "bubble_detection_params",
        "description": "吹き出し自動検出用画像処理パラメータ",
        "content": '{"min_area": 1000, "min_brightness": 150}'
    },
    {
        "key": "speech_rewrite_system_prompt",
        "description": "セリフ口調変換用システムプロンプト（基本方針・キャラクター性。※構造化タグ等は自動付与されます）",
        "content": (
            "あなたはセリフの言い回しや口調を変換する専門家です。\n"
            "元のセリフの意味、状況、感情、意図は一切変えずに、指定された口調・話し方・キャラクター特徴に合わせて自然なセリフに書き換えてください。\n\n"
            "【基本方針】\n"
            "1. セリフの意味内容・文脈・伝達したい情報は忠実に維持すること。\n"
            "2. 指定された口調、語尾、一人称・二人称、キャラクターの性格ニュアンスを的確に反映すること。"
        ),
    }
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
