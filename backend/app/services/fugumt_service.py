import logging
import os
import re
from typing import Any, List, Optional

logger = logging.getLogger(__name__)


class FuguMTService:
    """FuguMT CPU-translation engine service."""

    _instance: Optional["FuguMTService"] = None
    MAX_BATCH_SIZE: int = 100

    def __init__(self, model_dir: Optional[str] = None, intra_threads: int = 6) -> None:
        self.model_dir: str = model_dir or os.environ.get("FUGUMT_MODEL_DIR", "models/fugumt-en-ja")
        self.intra_threads: int = intra_threads
        self.translator: Any = None
        self.tokenizer: Any = None
        self._is_initialized: bool = False

    @classmethod
    def get_instance(cls) -> "FuguMTService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def initialize(self) -> bool:
        """Lazily initialize ctranslate2 Translator and HuggingFace AutoTokenizer."""
        if self._is_initialized and self.translator is not None and self.tokenizer is not None:
            return True

        if not os.path.exists(self.model_dir):
            logger.warning("FuguMT model directory not found: %s", self.model_dir)
            self._is_initialized = False
            return False

        try:
            import ctranslate2  # type: ignore[import-untyped]
            from transformers import AutoTokenizer

            self.translator = ctranslate2.Translator(
                self.model_dir,
                device="cpu",
                intra_threads=self.intra_threads,
                inter_threads=1,
                compute_type="int8",
            )
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_dir)
            self._is_initialized = True
            return True
        except Exception as e:
            logger.error("Failed to initialize FuguMT engine: %s", e)
            self._is_initialized = False
            return False

    def set_translator(self, translator: Any, tokenizer: Any) -> None:
        """Inject translator and tokenizer instances (for testing or CI)."""
        self.translator = translator
        self.tokenizer = tokenizer
        self._is_initialized = True

    def normalize_input(self, text: str) -> str:
        """Normalize whitespace and trim input text."""
        if not text:
            return ""
        cleaned = text.strip()
        if not cleaned:
            return ""
        return re.sub(r"\s+", " ", cleaned)

    def translate_batch(self, texts: List[str]) -> List[str]:
        """Translate a batch of English texts to Japanese using FuguMT."""
        if not texts:
            return []

        if not self._is_initialized or self.translator is None or self.tokenizer is None:
            if not self.initialize():
                raise RuntimeError("FuguMT engine is not available")

        normalized_texts = [self.normalize_input(t) for t in texts]
        all_translations: List[str] = []

        for i in range(0, len(normalized_texts), self.MAX_BATCH_SIZE):
            chunk = normalized_texts[i : i + self.MAX_BATCH_SIZE]
            source_tokens = [
                self.tokenizer.convert_ids_to_tokens(self.tokenizer.encode(t))
                for t in chunk
            ]
            results = self.translator.translate_batch(source_tokens)

            for res in results:
                target_tokens = res.hypotheses[0] if hasattr(res, "hypotheses") else res
                if hasattr(self.tokenizer, "convert_tokens_to_ids"):
                    try:
                        target_ids = self.tokenizer.convert_tokens_to_ids(target_tokens)
                        decoded = self.tokenizer.decode(target_ids)
                    except Exception:
                        decoded = self.tokenizer.decode(target_tokens)
                else:
                    decoded = self.tokenizer.decode(target_tokens)
                all_translations.append(decoded)

        return all_translations
