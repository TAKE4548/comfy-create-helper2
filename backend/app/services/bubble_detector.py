import cv2
import numpy as np
from pathlib import Path

def detect_bubble(
    image_path: str,
    roi: dict | None = None,
    min_area: int = 1000,
    min_brightness: int = 150
) -> dict | None:
    """
    Returns {"x": int, "y": int, "w": int, "h": int, "confidence": float} or None.
    roi: {"x": int, "y": int, "w": int, "h": int} or None (全画像検索)
    """
    img = cv2.imread(str(image_path))
    if img is None:
        return None
    
    # 1. カラー画像から直接「白い領域」の二値化マスクを作成 (BGRすべてがmin_brightness以上の領域)
    white_mask = cv2.inRange(img, (min_brightness, min_brightness, min_brightness), (255, 255, 255))
    
    # 2. 輪郭抽出 (RETR_EXTERNAL を用いて最も外側の輪郭のみを抽出。これで中の文字は無視される)
    contours, _ = cv2.findContours(white_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return None
    
    best = None
    best_area = 0
    for cnt in contours:
        x2, y2, w2, h2 = cv2.boundingRect(cnt)
        
        # 面積はバウンディングボックスの面積 (w * h) を使用
        area = w2 * h2
        if area < min_area:
            continue
        
        # ROI指定がある場合、検出された輪郭のバウンディングボックスの中心座標がROI範囲内に含まれているか判定
        if roi:
            rx, ry, rw, rh = roi["x"], roi["y"], roi["w"], roi["h"]
            cx = x2 + w2 / 2
            cy = y2 + h2 / 2
            if not (rx <= cx <= rx + rw and ry <= cy <= ry + rh):
                continue
                
        # 矩形らしさチェック (aspect ratio)
        aspect = w2 / max(h2, 1)
        if aspect < 0.3 or aspect > 10:
            continue
            
        if area > best_area:
            best_area = area
            best = (x2, y2, w2, h2)
    
    if best is None:
        return None
        
    x3, y3, w3, h3 = best
    if roi:
        denom_area = roi["w"] * roi["h"]
    else:
        denom_area = img.shape[0] * img.shape[1]
    confidence = min(best_area / denom_area * 10, 1.0)
    return {"x": x3, "y": y3, "w": w3, "h": h3, "confidence": round(confidence, 2)}


def detect_bubble_candidates(
    image_path: str,
    roi: dict | None = None,
    min_area: int = 1000,
    min_brightness: int = 150
) -> list[dict]:
    """
    Returns all detected contours and their metadata with filter status using Color White-Mask logic.
    """
    img = cv2.imread(str(image_path))
    if img is None:
        return []
    
    white_mask = cv2.inRange(img, (min_brightness, min_brightness, min_brightness), (255, 255, 255))
    contours, _ = cv2.findContours(white_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    candidates = []
    if not contours:
        return []
        
    for idx, cnt in enumerate(contours):
        x2, y2, w2, h2 = cv2.boundingRect(cnt)
        area = w2 * h2
        
        status = "PASS"
        
        # 1. Area check (using bbox area)
        if area < min_area:
            status = "FAIL_AREA"
            
        # 2. ROI check
        if status == "PASS" and roi:
            rx, ry, rw, rh = roi["x"], roi["y"], roi["w"], roi["h"]
            cx = x2 + w2 / 2
            cy = y2 + h2 / 2
            if not (rx <= cx <= rx + rw and ry <= cy <= ry + rh):
                status = "FAIL_ROI"
                
        # 3. Aspect Ratio check
        if status == "PASS":
            aspect = w2 / max(h2, 1)
            if aspect < 0.3 or aspect > 10:
                status = "FAIL_ASPECT"
                
        # 4. Brightness check
        orig_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        roi_region = orig_gray[y2:y2+h2, x2:x2+w2]
        mean_bright = roi_region.mean() if roi_region.size > 0 else 0.0

        aspect = w2 / max(h2, 1)
        candidates.append({
            "id": idx + 1,
            "x": x2,
            "y": y2,
            "w": w2,
            "h": h2,
            "area": int(area),
            "aspect_ratio": round(aspect, 2),
            "mean_brightness": round(float(mean_bright), 1),
            "status": status
        })
        
    return candidates
