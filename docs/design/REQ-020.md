# REQ-020 詳細設計書

## 1. 背景・目的
複数のプロンプト入力欄（ポジティブ、ネガティブ等）が常にすべて展開された状態で表示されており、入力内容が多くなると画面のスクロール量が増え、視認性が低下する。
不要な表示領域を折り畳むことでインタラクションコストを下げ、編集に集中できるスペース制御機能を提供する。

## 2. システム構成・変更概要
本修正はフロントエンド（React/TypeScript）での機能追加となります。

1. **個別折り畳み・展開トグルUIの導入**
   - デスクトップ表示およびモバイル表示の各プロンプト入力欄（セクション）に、個別に展開・折り畳みを行うトグルヘッダー（またはトグルボタン）を追加します。
2. **状態のブラウザキャッシュ（localStorage）永続化**
   - 折り畳み状態（`collapsed`）を `prompt-surgeon-collapsed-${role}` というキーで `localStorage` に保存・復元します。
3. **特定アクションによる自動展開トリガーの追加**
   - **アセット追加時**: アセット追加ハンドラ経由でアセットが追加された際、対象の入力欄を自動的に「展開」状態にします。
   - **テキスト入力モード切替時**: `TagChipEditor` の「テキスト入力モード切替」ボタンが押下された際、対象セクションを自動的に「展開」状態にします。

## 3. 詳細設計

### 3.1 状態管理
`GeneratePage.tsx` において、各プロンプト枠（role）の折り畳み状態を React の state として管理します。
```typescript
const [collapsedRoles, setCollapsedRoles] = useState<Record<string, boolean>>(() => {
  // 初期値の復元
  const initial: Record<string, boolean> = {};
  // textMappingsなどの初期化に合わせるか、汎用的に取得できるようにする
  return initial;
});
```

状態更新用のユーティリティ：
```typescript
const setRoleCollapsed = (role: string, isCollapsed: boolean) => {
  setCollapsedRoles(prev => {
    const next = { ...prev, [role]: isCollapsed };
    localStorage.setItem(`prompt-surgeon-collapsed-${role}`, JSON.stringify(isCollapsed));
    return next;
  });
};
```

### 3.2 UI デザイン・アニメーション
- **ヘッダー領域**: クリックで展開・折り畳みをトグル可能とし、ホバーエフェクトと展開状態を示す Chevron アイコン（`ChevronDown` または `ChevronRight`）を表示します。
- **情報密度の最小化**: 折り畳み時には入力フィールド、アセット追加ボタン、適用済みアセットチップなどの全要素を非表示（`display: none` または JSX 評価での除外）とし、タイトル部分のみをシンプルな形で表示して縦方向の占有スペースを最小化します。

### 3.3 自動展開トリガー
1. **アセット追加**:
   - `handleAddLoraAsset` および `handleAddTagSetAsset` 処理内で、`setRoleCollapsed(role, false)` を呼び出して強制展開します。
2. **テキスト入力モード切替**:
   - `TagChipEditor` 内部のテキストモード切替時に `tag-chip-editor:text-mode-toggle` カスタムイベントを window にディスパッチします。
   - `GeneratePage.tsx` にて当該イベントを監視し、イベントを受け取った際に該当の `role` を展開します。

## 4. 影響範囲 (SSoT)
- **フロントエンドコード**:
  - [GeneratePage.tsx](file:///frontend/src/pages/GeneratePage.tsx) (トグルUI追加、状態管理、イベント監視、アセット追加トリガー)
  - [TagChipEditor/index.tsx](file:///frontend/src/components/TagChipEditor/index.tsx) (カスタムイベントのディスパッチ追加)
