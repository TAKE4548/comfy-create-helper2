# Design Doc: REQ-091 ComfyUI Node Bypass & Error Toast

ComfyUIワークフローにおける任意のノード（単一、複数、サブグラフ）をバイパス（無効化・直結）し、型矛盾等のComfyUIエラーをフロントエンドでトースト表示する機能の設計。
本機能では、バイパス設定（プロファイル）を名前付きで複数登録し、データベース（SQLite）で永続化し、パラメータパネル上で動的にトグル操作可能にします。

## 1. ユーザーインターフェース (UI) 設計

### 1-1. バイパスプロファイル設定モーダル (`BypassSettingsModal.tsx`)
- **役割**: バイパス設定（プロファイル）の管理（新規作成、名前変更、削除、対象ノードの選択）。
- **表示内容**:
  - 左側: 登録済みのバイパスプロファイル一覧（選択・追加・削除・名前変更が可能）。
  - 右側: 現在選択中のバイパスプロファイルに含まれるバイパス対象ノードのチェックボックス一覧。
  - 表示名には、`_meta.title` があればそれを優先し、なければ `class_type` + `[ID]` を表示。
- **起動条件**: パラメータパネルの末尾にある「バイパス設定を開く」ボタンから起動。

### 1-2. パラメータパネルへのトグル表示
- **配置**: `ParamPanel.tsx` の末尾（またはその下部）に、登録された各バイパスプロファイルの名前とON/OFFを切り替えるトグルスイッチ（またはチェックボックス）を動的に描画。
- **挙動**:
  - トグルのON/OFFは即座にデータベース（およびフロントエンドのストア）に反映（永続化）されます。
  - 有効になっている（ONの）すべてのバイパスプロファイルの `bypassed_node_ids` の論理和（和集合）が、生成送信時にバイパス対象になります。

### 1-3. エラートースト通知
- **表示形式**: 画面上部中央に一時的に浮かび上がるフローティングトースト。
- **自動消去**: 表示から5秒後に自動的にフェードアウトして消滅。
- **手動消去**: トーストの右側に「✕」ボタンを配置。

---

## 2. データベース & バックエンド API 設計

### 2-1. データベーススキーマ (`backend/app/models.py`)
新規に `BypassProfile` テーブルを追加します。
```python
class BypassProfile(Base):
    __tablename__ = "bypass_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[int] = mapped_column(ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    bypassed_node_ids: Mapped[str] = mapped_column(Text, nullable=False)  # JSONリスト: '["829", "830"]'
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    workflow: Mapped["Workflow"] = relationship(back_populates="bypass_profiles")
```
※ `Workflow` クラス（`backend/app/models.py` 内）にも `bypass_profiles` リレーションを追加します。
`bypass_profiles: Mapped[list["BypassProfile"]] = relationship(back_populates="workflow", cascade="all, delete-orphan")`

### 2-2. APIエンドポイント (`backend/app/routers/bypass_profiles.py`)
- `GET /api/workflows/{workflow_id}/bypass-profiles`: 指定ワークフローのバイパスプロファイル一覧を取得
- `POST /api/workflows/{workflow_id}/bypass-profiles`: 新規プロファイルを作成
- `PUT /api/bypass-profiles/{profile_id}`: プロファイル情報（名前、対象ノード、有効状態）を更新
- `DELETE /api/bypass-profiles/{profile_id}`: プロファイルを削除

---

## 3. データ構造とバイパス（ブリッジ）アルゴリズム

### 3-1. 同タイプマッピングのブリッジ処理
ComfyUIへのPOST送信直前（`useGenerateAction.ts` 内での送信データ構築時）に、以下のアルゴリズムでワークフローJSONを動的に書き換える。

#### アルゴリズム手順
1. `currentWorkflow` のディープコピー `wf` を作成。
2. 有効（`is_enabled === true`）になっている全プロファイルの `bypassed_node_ids` から、重複のないバイパス対象ノードIDのセット（`activeBypassNodeIds`）を算出する。
3. `activeBypassNodeIds` 内の各ノード `B` について以下を実行:
   - `B` の `class_type` を取得.
   - `comfyObjectInfo` から、ノード `B` の「入力端子とそのデータタイプ」および「出力端子とそのデータタイプ」を取得.
     - **出力データタイプ**: `comfyObjectInfo[class_type].output` (例: `["MODEL", "CLIP"]`)
     - **入力データタイプ**: `comfyObjectInfo[class_type].input.required` および `optional` のキーと、その値の配列の最初の要素 (例: `{"model": ["MODEL", {}]}`)
   - 入力スロット名と出力スロットインデックスの間で、データタイプ（文字列）が完全に一致するペアを見つけて「ブリッジテーブル」を作る。
     - 例: `{ inputSlotName: string } -> { outputIndex: number }`
     - ※同一のデータタイプが複数ある場合は、最初に見つかったもの同士をペアにする.
   - `wf` 内のすべてのノード `D` の `inputs` を走査:
     - もし `D` のある入力が `B` からの出力（例: `[ "B", outputIndex ]`）に接続されている場合:
       - 上記ブリッジテーブルから、`outputIndex` に対応する入力スロット名 `inputSlotName` を引く。
       - ノード `B` 自体のその入力スロットへの接続先 `S`（例: `wf[B].inputs[inputSlotName]`、値は `[ "S_ID", S_outputIndex ]`）を取得。
       - `D` の入力を、直接 `S` へ書き換える（`[ "S_ID", S_outputIndex ]`）。
   - すべての繋ぎ替えが終わったら、`wf` からノード `B` のキー自体を削除（`delete wf[B]`）する。

---

## 4. エラーハンドリング仕様

### 4-1. ComfyUIエラーの検知と伝播
- `useGenerationStore` の `queuePrompt` メソッド内で、`/prompt` のレスポンスを検証。
- `!res.ok` の場合、エラーレスポンスから詳細を取得する。
  - ComfyUIはAPIエラー時、以下のようなJSONを返すことがある:
    ```json
    {
      "error": {
        "type": "prompt_outputs_failed_validation",
        "message": "Required input is missing",
        "details": "Node 825: easy loraStack",
        "extra_info": {}
      }
    }
    ```
  - これらの詳細エラーテキスト（`error.message` や `error.details` 等）を抽出し、トーストとして表示するメッセージを構築。

### 4-2. トーストの状態管理
- `useGenerationStore` に以下のステートとアクションを追加:
  - `errorToast: { message: string; type: 'error' | 'success' } | null`
  - `setErrorToast: (toast: { message: string; type: 'error' | 'success' } | null) => void`
