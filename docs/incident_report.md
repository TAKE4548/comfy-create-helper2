# インシデントレポート: 生成プロンプトのタグ無効化後に画面切替・再描画で無効タグが消失する事象

## 1. 事象概要 (Overview)

生成画面（`GeneratePage`）のプロンプト入力欄（`TagChipEditor`）において、タグチップをクリックして「無効化（グレーアウト）」状態にした後、別画面への遷移（LoRAs/Tags/History/Settingsへの移動）やアコーディオンの開閉、モバイルでのプロンプトタブ切替など、コンポーネントの再マウントまたは外部同期が発生すると、無効化されていたタグが復元されずに完全に消失してしまう。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

### 再現手順:
1. 生成ページ（`/`）を開き、プロンプト入力欄に複数のタグ（例: `masterpiece, 1girl, smile`）がチップとして表示されている状態にする。
2. いずれかのタグチップ（例: `smile`）をクリックして「無効化（取り消し線・グレーアウト）」にする。
3. 以下のいずれかの操作（画面切替・再描画・再マウント）を行う：
   - **パターンA（ページ切替）**: サイドメニューから「History」または「Tags」ページへ移動し、再度「Generate」ページへ戻る。
   - **パターンB（アコーディオン開閉）**: プロンプト欄上部のアコーディオン開閉ボタンを押してセクションを閉じ、再度開く。
   - **パターンC（モバイルタブ切替）**: モバイル表示にて「Positive」から「Negative」タブへ切り替え、再度「Positive」タブへ戻る。
   - **パターンD（Multi-Set切替）**: 「Set 1」から「Set 2」へ切り替え、再度「Set 1」へ戻る。

### 観測結果:
- **期待値**: 無効化したタグ（`smile`）がグレーアウト（無効）のまま保持され、再描画後もチップ列内に残り続ける。
- **実際の結果**: 再描画後、無効化していたタグ（`smile`）がチップ列から完全に消失し、有効なタグ（`masterpiece, 1girl`）のみが表示される。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 | 詳細 |
|---|---|---|---|
| 1 | `docs/specs/SPEC_COMMON.md` | L110-L120, L151-L160 | SSoT仕様書において、`TagChipEditorProps` の `onChange` が「有効チップのみをカンマ連結した文字列を返す」と定義されており、無効タグの保持・復元に関する仕様およびインターフェースが欠落している |
| 2 | `frontend/src/components/TagChipEditor/useChipParser.ts` | L26-L47 | `chipsToString` が `chip.enabled` のタグのみを抽出して文字列化し、`parseToChips` は渡された文字列から全タグを `enabled: true` として初期化している |
| 3 | `frontend/src/components/TagChipEditor/index.tsx` | L46-L47, L74-L84, L95-L106 | チップの有効/無効状態を内部のローカルステート（`useChipHistory`）のみで管理し、`onChange` では無効タグが除去された文字列 `newStr` を親へ通知しているため、再マウント時に `parseToChips(value)` が実行されると無効タグが喪失する |
| 4 | `frontend/src/pages/GeneratePage/components/DesktopLayout.tsx` | L600-L608 | `{!isCollapsed && <TagChipEditor ... />}` でアコーディオン閉時にアンマウントされ、親ストアの `paramValues`（文字列）から再マウントされる |
| 5 | `frontend/src/pages/GeneratePage/components/MobileLayout.tsx` | L698-L709 | タブ切替時に `activePromptTabMapping.role` が切り替わり、親ストアの `paramValues[role]` と同期される |
| 6 | `frontend/src/store/slices/multiSetSlice.ts` | L41 | ストア側の `paramValues` は `Record<string, string>` 型であり、有効タグのカンマ区切り平文文字列しか保持できない構造となっている |
| 7 | `frontend/src/App.tsx` | L51-L61 | ルーティング切替時に `GeneratePage` がアンマウントされる |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 原因: SSoT仕様およびコンポーネント設計における「無効タグ状態の永続化仕様」の欠落と状態不整合

1. **SSoT（`SPEC_COMMON.md`）の契約上の制約**:
   - `SPEC_COMMON.md` の第3項（TagChipEditor コンポーネント仕様）において、コンポーネントのPropsは以下のように定義されている：
     ```typescript
     interface TagChipEditorProps {
       value: string;                   // カンマ区切りプロンプト文字列
       onChange: (val: string) => void; // 有効チップのみをカンマ連結した文字列を返す
     }
     ```
   - さらに、パース・シリアライズ仕様として以下が明記されている：
     ```typescript
     // 有効チップのみをカンマ連結
     function chipsToString(chips: TagChip[]): string {
       return chips.filter(c => c.enabled).map(c => c.text).join(", ");
     }
     // 文字列から全チップを enabled: true として生成
     function parseToChips(text: string): TagChip[] {
       return text.split(",").map(s => s.trim()).filter(Boolean)
         .map(text => ({ id: generateChipId(), text, enabled: true }));
     }
     ```
2. **親ストアとコンポーネント間での情報喪失の発生メカニズム**:
   - ユーザーがタグを無効化（`enabled = false`）すると、`TagChipEditor/index.tsx` の `useEffect`（L95-106）により `chipsToString(state)` が評価される。
   - この時点で無効化されたタグは除外され、有効タグのみの文字列が親コンポーネント（`DesktopLayout` / `MobileLayout`）経由でグローバルストア（`useGenerationStore.paramValues`）に `setParamValues` される。
   - 結果として、グローバルストア上の `paramValues[role]` には無効化タグの情報が一切残らない。
3. **ライフサイクル（アンマウント・外部同期）による状態破棄**:
   - 無効化タグの存在は `TagChipEditor` のローカルステート（`useChipHistory`）にしか存在しない。
   - 画面遷移（React Routerによる他ページ遷移）、アコーディオン開閉（`!isCollapsed` による条件付きレンダリング）、タブ切替、Multi-Set切替、画面リサイズ等が発生すると、`TagChipEditor` がアンマウントされるか外部Props同期（L74-84）が走る。
   - 再マウント時に親から渡される `value` は無効タグが除去済みの文字列であるため、`parseToChips(value)` が実行された結果、無効化タグは完全に失われる。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_B: Specification Flaw
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **分類**: **Type B (Specification Flaw - 仕様の不備・欠落)**
  * 単なるコーディングミスではなく、SSoTである `docs/specs/SPEC_COMMON.md` において「`onChange` は有効チップのみのカンマ区切り文字列を親へ返す」「`value` はカンマ区切り文字列」と規定されており、無効化タグの状態をコンポーネント外（ストア・セット・永続化層）でどのように保持・表現・復元するかの仕様が根本的に欠落・不整合を起こしているため。
  * （※旧検討仕様 `docs/spec_tag_chip_editor.md` L48-78 では「フォーム状態に `chips: TagChip[]` を保持し、ComfyUI投入時およびスナップショット保存時のみ `toPromptString(chips)`（有効チップ抽出）を行う」という構想が存在していたが、現行SSoTへの統合時にインターフェースが `string` 単一に簡素化され、ライフサイクル保持仕様が抜け落ちた経緯がある。）

---

## 6. バックログ登録とルーティング (Backlog Registration & Routing)

- **登録 PBI**: [REQ-220.md](./backlog/pbi/active/REQ-220.md)
- **タイトル**: `生成プロンプト（TagChipEditor）の無効化タグ状態永続化およびライフサイクル保持`
- **次のワークフロー**: `/dev-design REQ-220`

