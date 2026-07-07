# Test Plan: REQ-091 ComfyUI Node Bypass & Error Toast

## 1. ユニットテスト (Automated Unit Tests)
`bypassUtils.ts` のバイパス（繋ぎ替え）ロジックが期待通り動作することを確認するための単体テスト、およびバックエンドAPIのテストを実行します。

### テスト実行コマンド
#### フロントエンド
```bash
npx vitest run src/utils/__tests__/bypassUtils.test.ts
```

#### バックエンド (APIテスト)
```bash
$env:PYTHONPATH="."; pytest backend/tests/test_bypass_profiles.py -v --tb=short
```

### ユニットテスト実装詳細 (Unit Test Specs)

#### フロントエンド: `frontend/src/utils/__tests__/bypassUtils.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { applyBypass } from '../bypassUtils';

const comfyObjectInfo = {
  KSampler: {
    input: {
      required: {
        model: ["MODEL", {}],
        positive: ["CONDITIONING", {}],
        negative: ["CONDITIONING", {}],
        latent_image: ["LATENT", {}]
      }
    },
    output: ["LATENT"]
  },
  VAEDecode: {
    input: {
      required: {
        samples: ["LATENT", {}],
        vae: ["VAE", {}]
      }
    },
    output: ["IMAGE"]
  },
  EmptyLatentImage: {
    output: ["LATENT"]
  }
};

describe('bypassUtils', () => {
  it('should successfully bypass a single node with type matching', () => {
    // 5 (EmptyLatentImage) -> 3 (KSampler) -> 6 (VAEDecode)
    const workflow = {
      "3": {
        "inputs": {
          "model": ["1", 0],
          "positive": ["2", 0],
          "negative": ["2", 1],
          "latent_image": ["5", 0]
        },
        "class_type": "KSampler"
      },
      "5": {
        "inputs": {},
        "class_type": "EmptyLatentImage"
      },
      "6": {
        "inputs": {
          "samples": ["3", 0],
          "vae": ["1", 2]
        },
        "class_type": "VAEDecode"
      }
    };

    // Bypass KSampler (node "3")
    const result = applyBypass(workflow, ["3"], comfyObjectInfo);

    expect(result["3"]).toBeUndefined();
    expect(result["5"]).toBeDefined();
    expect(result["6"]).toBeDefined();
    expect(result["6"].inputs.samples).toEqual(["5", 0]);
    expect(result["6"].inputs.vae).toEqual(["1", 2]);
  });

  it('should sever connections when types do not match (type mismatch)', () => {
    const customComfyInfo = {
      ...comfyObjectInfo,
      MismatchNode: {
        input: {
          required: {
            input_val: ["TEXT", {}]
          }
        },
        output: ["IMAGE"]
      }
    };

    const workflow = {
      "2": {
        "inputs": {
          "input_val": "hello"
        },
        "class_type": "MismatchNode"
      },
      "6": {
        "inputs": {
          "samples": ["2", 0],
          "vae": ["1", 2]
        },
        "class_type": "VAEDecode"
      }
    };

    // Bypass MismatchNode (node "2")
    const result = applyBypass(workflow, ["2"], customComfyInfo);

    expect(result["2"]).toBeUndefined();
    expect(result["6"].inputs.samples).toBeUndefined();
    expect(result["6"].inputs.vae).toEqual(["1", 2]);
  });
});
```

#### バックエンド: `backend/tests/test_bypass_profiles.py`
```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

# ※ db_session および client フィクスチャは backend/tests/conftest.py にて定義され、
# 実行ごとに db_session.rollback() を行いクリーンな状態を担保します。

def test_create_bypass_profile(client: TestClient, db_session):
    # テスト用ワークフロー作成
    wf_res = client.post("/api/workflows", json={
        "name": "Test Workflow For Bypass",
        "json_body": "{}"
    })
    assert wf_res.status_code == 200
    wf_id = wf_res.json()["id"]

    # プロファイル作成
    profile_data = {
        "name": "Skip_Detailer_v1",
        "bypassed_node_ids": "[\"10\"]",
        "is_enabled": True
    }
    res = client.post(f"/api/workflows/{wf_id}/bypass-profiles", json=profile_data)
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Skip_Detailer_v1"
    assert data["bypassed_node_ids"] == ["10"]
```

---

## 2. プログラム的UI検証 (Cypress E2E Style Verification)
手動テストによるあいまいな判定を排除するため、データ属性 (`data-testid`) を利用した決定論的テストコードに従って動作検証を行います。

### シナリオ1: UI操作とバイパスプロファイル管理の永続性
```javascript
// 1. 生成ページを開き、Bypass Settings モーダルを表示
cy.visit('/generate');
cy.get('#bypass-settings-btn').click();
cy.get('h3').contains('Bypass Settings').should('be.visible');

// 2. 新規プロファイルを追加
cy.get('button').contains('Add').click();
cy.get('input[placeholder="Profile name..."]').type('Skip_Detailer_v1');
cy.get('button[type="submit"]').click();
cy.get('span.font-medium').contains('Skip_Detailer_v1').should('be.visible');

// 3. 対象ノードをバイパス選択 (例: KSampler)
cy.get('label').contains('KSampler').find('input[type="checkbox"]').check();
cy.get('button').find('svg').first().click(); // モーダルを閉じる

// 4. ハードリフレッシュによる状態の永続性を検証
cy.reload();
cy.get('#bypass-settings-btn').click();
cy.get('span.font-medium').contains('Skip_Detailer_v1').should('be.visible');
cy.get('label').contains('KSampler').find('input[type="checkbox"]').should('be.checked');
```

### シナリオ2: エラートーストの表示内容と自動消滅タイミング検証
```javascript
// 1. 型不一致が起きる不正なバイパスプロファイルを選択してONにする
cy.get('label').contains('VAEDecode').find('input[type="checkbox"]').check();
cy.get('button').find('svg').first().click(); // モーダルを閉じる
cy.get('span').contains('Skip_Detailer_v1').should('be.visible');
cy.get('[id^="bypass-toggle-"]').first().click(); // トグルをONにする

// 2. 生成ボタンを押下して送信時のバリデーションエラーを検知
const startTime = performance.now();
cy.get('#generate-btn').click();

// 3. トーストが表示されること、かつメッセージ内容が正確であることを検証
cy.get('.fixed.bg-red-900.border-red-800').should('be.visible')
  .find('span.text-sm.font-medium')
  .invoke('text')
  .then((text) => {
    expect(text.trim()).to.equal('ComfyUI Error: Input type mismatch (Expected IMAGE, got LATENT)');
  });

// 4. トーストが自動消滅するまでの時間が 5.0秒 ± 1.0秒 の許容範囲内であることを検証
cy.get('.fixed.bg-red-900.border-red-800').should('not.exist').then(() => {
  const endTime = performance.now();
  const duration = endTime - startTime;
  expect(duration).to.be.closeTo(5000, 1000); // 5000ms ± 1000ms (環境差による許容度を含む)
});
```
