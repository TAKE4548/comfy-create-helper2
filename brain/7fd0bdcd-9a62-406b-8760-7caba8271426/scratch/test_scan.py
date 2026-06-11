import sqlite3
import json
from app.services.workflow_scanner import scan_workflow
from app import models

# Define a mock/read mapping masters from python structure representing the updated list of masters
# (with the two new masters added)
masters = [
    models.MappingMaster(id=1, role="Main_Positive_Prompt", expected_class_types=json.dumps(["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]), param_name="text", input_type="textarea", display_name="Main positive prompt", title_patterns=json.dumps(["MainPrompt", "Main_positive", "Main_Positive_Prompt"])),
    models.MappingMaster(id=2, role="Face_Positive_Prompt", expected_class_types=json.dumps(["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]), param_name="text", input_type="textarea", display_name="Face positive prompt", title_patterns=json.dumps(["FacePrompt", "Face_positive", "Face_Positive_Prompt"])),
    models.MappingMaster(id=3, role="Negative_Prompt", expected_class_types=json.dumps(["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]), param_name="text", input_type="textarea", display_name="Negative prompt", title_patterns=json.dumps(["Main_negative", "Negative_Prompt"])),
    models.MappingMaster(id=4, role="Sampler_Seed", expected_class_types=json.dumps(["KSampler", "KSamplerAdvanced"]), param_name="seed", input_type="int", display_name="Sampler Seed", title_patterns=json.dumps(["MainSampler", "Sampler_Seed"])),
    models.MappingMaster(id=5, role="Sampler_Steps", expected_class_types=json.dumps(["KSampler", "KSamplerAdvanced"]), param_name="steps", input_type="int", display_name="Sampler Steps", title_patterns=json.dumps(["MainSampler", "Sampler_Steps"])),
    models.MappingMaster(id=6, role="Sampler_cfg", expected_class_types=json.dumps(["KSampler", "KSamplerAdvanced"]), param_name="cfg", input_type="float", display_name="Sampler CFG", title_patterns=json.dumps(["MainSampler", "Sampler_cfg"])),
    models.MappingMaster(id=7, role="Sampler_denoise", expected_class_types=json.dumps(["KSampler", "KSamplerAdvanced"]), param_name="denoise", input_type="float", display_name="Sampler Denoise", title_patterns=json.dumps(["MainSampler", "Sampler_denoise"])),
    models.MappingMaster(id=8, role="Prompt_Quality", expected_class_types=json.dumps(["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]), param_name="text", input_type="textarea", display_name="Quality Tags", title_patterns=json.dumps(["QualityPrompt", "Prompt_Quality", "Quality"])),
    models.MappingMaster(id=9, role="Prompt_Core", expected_class_types=json.dumps(["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]), param_name="text", input_type="textarea", display_name="Core Settings", title_patterns=json.dumps(["CorePrompt", "Prompt_Core", "CoreSettings"])),
    models.MappingMaster(id=10, role="Prompt_Char_Series", expected_class_types=json.dumps(["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]), param_name="text", input_type="textarea", display_name="Character / Series", title_patterns=json.dumps(["CharSeriesPrompt", "Prompt_Char_Series", "Character"])),
    models.MappingMaster(id=11, role="Prompt_Char_Body_Outfit", expected_class_types=json.dumps(["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]), param_name="text", input_type="textarea", display_name="Body & Outfit", title_patterns=json.dumps(["BodyOutfitPrompt", "Prompt_Char_Body_Outfit", "Body"])),
    models.MappingMaster(id=12, role="Prompt_Pose_Action", expected_class_types=json.dumps(["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]), param_name="text", input_type="textarea", display_name="Pose & Action", title_patterns=json.dumps(["PoseActionPrompt", "Prompt_Pose_Action", "Pose"])),
    models.MappingMaster(id=13, role="Prompt_Expression", expected_class_types=json.dumps(["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]), param_name="text", input_type="textarea", display_name="Expression", title_patterns=json.dumps(["ExpressionPrompt", "Prompt_Expression", "Expression"])),
    models.MappingMaster(id=14, role="Prompt_Composition", expected_class_types=json.dumps(["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]), param_name="text", input_type="textarea", display_name="Composition", title_patterns=json.dumps(["CompositionPrompt", "Prompt_Composition", "Composition"])),
    models.MappingMaster(id=15, role="Prompt_Background_Environment", expected_class_types=json.dumps(["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]), param_name="text", input_type="textarea", display_name="Background & Environment", title_patterns=json.dumps(["BackgroundPrompt", "Prompt_Background_Environment", "Background"])),
    models.MappingMaster(id=16, role="Prompt_Lighting", expected_class_types=json.dumps(["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]), param_name="text", input_type="textarea", display_name="Lighting", title_patterns=json.dumps(["LightingPrompt", "Prompt_Lighting", "Lighting"])),
    models.MappingMaster(id=17, role="Character_Lora_Model", expected_class_types=json.dumps(["LoraLoader"]), param_name="lora_name", input_type="select", display_name="Character LoRA Model", title_patterns=json.dumps(["LoraName", "lora_name", "Character_Lora"])),
    models.MappingMaster(id=18, role="Character_Lora_Strength_Model", expected_class_types=json.dumps(["LoraLoader"]), param_name="strength_model", input_type="float", display_name="Character LoRA Strength (Model)", title_patterns=json.dumps(["LoraStrengthModel", "strength_model"])),
    models.MappingMaster(id=19, role="FDetailer_Steps", expected_class_types=json.dumps(["FaceDetailer"]), param_name="steps", input_type="int", display_name="FaceDetailer Steps", title_patterns=json.dumps(["FaceDetailer", "FDetailer_Steps"])),
    models.MappingMaster(id=20, role="FDetailer_cfg", expected_class_types=json.dumps(["FaceDetailer"]), param_name="cfg", input_type="float", display_name="FaceDetailer CFG", title_patterns=json.dumps(["FaceDetailer", "FDetailer_cfg"])),
    models.MappingMaster(id=21, role="FDetailer_denoise", expected_class_types=json.dumps(["FaceDetailer"]), param_name="denoise", input_type="float", display_name="FaceDetailer Denoise", title_patterns=json.dumps(["FaceDetailer", "FDetailer_denoise"])),
    # New ones:
    models.MappingMaster(id=22, role="Prompt_Char_Lora_Face", expected_class_types=json.dumps(["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]), param_name="text", input_type="textarea", display_name="Character LoRA Face", title_patterns=json.dumps(["Prompt_Char_Lora_Face", "Prompt_Char_Lora_Face_Prompt", "Char_Lora_Face"])),
    models.MappingMaster(id=23, role="Prompt_Char_Lora_Other", expected_class_types=json.dumps(["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]), param_name="text", input_type="textarea", display_name="Character LoRA Other", title_patterns=json.dumps(["Prompt_Char_Lora_Other", "Prompt_Char_Lora_Other_Prompt", "Char_Lora_Other"])),
]

conn = sqlite3.connect("c:\\Users\\audih\\ws\\comfy-create-helper2\\db\\prompt_surgeon.db")
cursor = conn.cursor()

for wf_id in [1, 2]:
    cursor.execute("SELECT name, json_body FROM workflows WHERE id = ?", (wf_id,))
    name, json_body = cursor.fetchone()
    wf_json = json.loads(json_body)
    
    print(f"\nScanning workflow: {name}")
    scan_result = scan_workflow(wf_json, masters)
    print("Matched:")
    for m in scan_result["matched"]:
        print(f"  {m['role']} -> Node {m['node_id']} ({m['node_title']})")
    print("Warnings:")
    for w in scan_result["warnings"]:
        print(f"  {w['role']}: {w['status']}")

conn.close()
