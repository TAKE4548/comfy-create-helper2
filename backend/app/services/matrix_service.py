import random
from collections import defaultdict
from typing import Any, Dict, List, Optional

FACTORS = {
    'shot': ['Close-up', 'Bust shot', 'Full body'],
    'angle': ['Front view', 'Three-quarter view', 'Profile / side view', 'Back view'],
    'expression': ['Gentle smile', 'Serious expression', 'Blushing smile', 'Looking away'],
    'pose': ['Standing straight', 'Sitting', 'Walking forward', 'Arms crossed'],
}

DEFAULT_TARGETS = {
    'shot': {'Close-up': 5, 'Bust shot': 9, 'Full body': 6},
    'angle': {'Front view': 5, 'Three-quarter view': 5, 'Profile / side view': 5, 'Back view': 5},
    'expression': {'Gentle smile': 5, 'Serious expression': 5, 'Blushing smile': 5, 'Looking away': 5},
    'pose': {'Standing straight': 5, 'Sitting': 5, 'Walking forward': 5, 'Arms crossed': 5},
    'outfit_type': {'default': 15, 'alt': 5},
}


class MatrixService:
    @staticmethod
    def _get_valid_combos() -> List[Dict[str, str]]:
        combos = []
        for s in FACTORS['shot']:
            for a in FACTORS['angle']:
                for e in FACTORS['expression']:
                    for p in FACTORS['pose']:
                        for o in ['default', 'alt']:
                            if s == 'Close-up' and p in ['Sitting', 'Walking forward']:
                                continue
                            combos.append({
                                'shot': s,
                                'angle': a,
                                'expression': e,
                                'pose': p,
                                'outfit_type': o,
                            })
        return combos

    @staticmethod
    def _build_targets(total_slots: int) -> Dict[str, Dict[str, int]]:
        if total_slots == 20:
            return {k: dict(v) for k, v in DEFAULT_TARGETS.items()}
        
        alt_n = max(1, round(total_slots * 0.25))
        default_n = total_slots - alt_n
        close_n = max(1, round(total_slots * 0.25))
        full_n = max(1, round(total_slots * 0.30))
        bust_n = total_slots - close_n - full_n

        def distribute_four(n: int, keys: List[str]) -> Dict[str, int]:
            base = n // len(keys)
            rem = n % len(keys)
            res = {}
            for i, k in enumerate(keys):
                res[k] = base + (1 if i < rem else 0)
            return res

        return {
            'shot': {'Close-up': close_n, 'Bust shot': bust_n, 'Full body': full_n},
            'angle': distribute_four(total_slots, FACTORS['angle']),
            'expression': distribute_four(total_slots, FACTORS['expression']),
            'pose': distribute_four(total_slots, FACTORS['pose']),
            'outfit_type': {'default': default_n, 'alt': alt_n},
        }

    @classmethod
    def solve_orthogonal_factors(
        cls, total_slots: int = 20, seed: Optional[int] = None
    ) -> List[Dict[str, str]]:
        rnd = random.Random(seed)
        targets = cls._build_targets(total_slots)
        valid_combos = cls._get_valid_combos()

        factor_keys = ['shot', 'angle', 'expression', 'pose', 'outfit_type']
        current_counts = {k: {v: 0 for v in vals} for k, vals in targets.items()}
        pair_counts: Dict[tuple, int] = defaultdict(int)

        selected: List[Dict[str, str]] = []
        for step in range(total_slots):
            feasible = []
            for c in valid_combos:
                if any(current_counts[k][c[k]] >= targets[k][c[k]] for k in factor_keys):
                    continue
                rem_closeup = (
                    targets['shot']['Close-up']
                    - current_counts['shot']['Close-up']
                    - (1 if c['shot'] == 'Close-up' else 0)
                )
                rem_stand = (
                    targets['pose']['Standing straight']
                    - current_counts['pose']['Standing straight']
                    - (1 if c['pose'] == 'Standing straight' else 0)
                )
                rem_arms = (
                    targets['pose']['Arms crossed']
                    - current_counts['pose']['Arms crossed']
                    - (1 if c['pose'] == 'Arms crossed' else 0)
                )
                if rem_stand + rem_arms < rem_closeup:
                    continue
                feasible.append(c)

            if not feasible:
                break

            best_candidates = []
            best_score = float('inf')
            for c in feasible:
                score = 0
                for i in range(len(factor_keys)):
                    for j in range(i + 1, len(factor_keys)):
                        k1, k2 = factor_keys[i], factor_keys[j]
                        pair = (k1, c[k1], k2, c[k2])
                        score += pair_counts[pair]
                if score < best_score:
                    best_score = score
                    best_candidates = [c]
                elif score == best_score:
                    best_candidates.append(c)

            chosen = rnd.choice(best_candidates)
            selected.append(chosen)
            for k in factor_keys:
                current_counts[k][chosen[k]] += 1
            for i in range(len(factor_keys)):
                for j in range(i + 1, len(factor_keys)):
                    k1, k2 = factor_keys[i], factor_keys[j]
                    pair_counts[(k1, chosen[k1], k2, chosen[k2])] += 1

        return selected

    @classmethod
    def generate_orthogonal_matrix(
        cls,
        meta_prompt: str,
        physical_prompt: str,
        default_outfit_prompt: str,
        alt_outfits: List[Dict[str, Any]],
        total_slots: int = 20,
        random_seed: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        factor_slots = cls.solve_orthogonal_factors(total_slots=total_slots, seed=random_seed)

        alt_indices = [idx for idx, s in enumerate(factor_slots) if s['outfit_type'] == 'alt']
        assigned_alt_tags: Dict[int, str] = {}
        if alt_outfits:
            for i, slot_idx in enumerate(alt_indices):
                alt_obj = alt_outfits[i % len(alt_outfits)]
                if isinstance(alt_obj, dict):
                    tag = alt_obj.get('prompt_tags') or alt_obj.get('tags') or ''
                elif isinstance(alt_obj, str):
                    tag = alt_obj
                else:
                    tag = str(alt_obj)
                assigned_alt_tags[slot_idx] = tag

        results: List[Dict[str, Any]] = []
        rnd = random.Random(random_seed)

        for idx, factors in enumerate(factor_slots, start=1):
            slot_factors = dict(factors)
            is_alt = slot_factors['outfit_type'] == 'alt'

            if is_alt:
                outfit_str = assigned_alt_tags.get(idx - 1, '')
            else:
                outfit_str = default_outfit_prompt

            parts = [
                meta_prompt,
                physical_prompt,
                outfit_str,
                slot_factors['shot'],
                slot_factors['angle'],
                slot_factors['expression'],
                slot_factors['pose'],
            ]
            raw_prompt = ', '.join(p.strip() for p in parts if p and p.strip())
            seed_val = rnd.randint(100_000_000, 999_999_999)

            results.append({
                'slot_index': idx,
                'factors': slot_factors,
                'raw_prompt': raw_prompt,
                'caption_text': raw_prompt,
                'seed': seed_val,
                'status': 'APPROVED',
            })

        return results
