'''Speech bubble migration and backfill script for speaker tag set IDs.'''

import json
import logging
import re
from typing import Optional
from sqlalchemy.orm import Session
from app.database import get_db_context
from app.models import Snapshot, TagSet

logger = logging.getLogger(__name__)


def migrate_existing_bubbles(
    color_to_tagset_id_map: dict[str, int],
    session: Optional[Session] = None
) -> int:
    '''過去の snapshots.params['speech_bubbles'] を検査し、文字色からキャラID付与 & SE厳格判定'''
    def _execute(db: Session) -> int:
        snapshots = db.query(Snapshot).all()
        updated_count = 0
        for s in snapshots:
            if not s.params:
                continue
            try:
                params_dict = json.loads(s.params) if isinstance(s.params, str) else s.params
            except Exception:
                continue
            bubbles = params_dict.get('speech_bubbles', [])
            if not bubbles:
                continue
            changed = False
            for b in bubbles:
                text = b.get('text', '').strip()
                is_shape_none = b.get('shape') == 'none'
                # 正規表現構文修正 (感嘆符類 または 2〜6文字のカタカナ/ひらがなオノマトペ)
                is_short_se = (
                    b.get('tail') is None
                    and len(text) <= 6
                    and bool(re.search(r'([!?！？〜～ッっ…・]|^[ァ-ヴーぁ-ん]{2,6}$)', text))
                )
                is_se = is_shape_none or is_short_se
                if b.get('is_se') != is_se:
                    b['is_se'] = is_se
                    changed = True
                else:
                    b['is_se'] = is_se

                # キャラクターID付与 (SE以外かつ未付与時)
                if not is_se and 'speaker_tag_set_id' not in b:
                    txt_color = b.get('style', {}).get('textColor') or b.get('textColor', '')
                    if txt_color in color_to_tagset_id_map:
                        b['speaker_tag_set_id'] = color_to_tagset_id_map[txt_color]
                        changed = True

            if changed:
                params_dict['speech_bubbles'] = bubbles
                s.params = json.dumps(params_dict, ensure_ascii=False)
                updated_count += 1
        db.commit()
        logger.info(f'Migrated {updated_count} snapshots successfully with safe SE detection.')
        return updated_count

    if session is not None:
        return _execute(session)
    with get_db_context() as db:
        return _execute(db)
