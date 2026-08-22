# REQ-158 テスト計画書 (Test Plan)

## 1. 自動テスト (Automated Tests)

### ユニットテスト実行
- **コマンド**:
  ```bash
  npm --prefix frontend test -- src/hooks/__tests__/useConfig.test.ts src/hooks/__tests__/useAlbums.test.ts src/components/__tests__/SpeechBubbleControls.test.tsx src/components/__tests__/SpeechBubbleEditorModal.test.tsx src/components/__tests__/BaseImageSelectModal.test.tsx
  ```
- **全体テスト実行**:
  ```bash
  npm --prefix frontend test -- --run
  ```

### 検証項目
1. **`useConfig` Hook**:
   - `configApi.get()` が呼び出され、コンフィグ情報が返却されること。
   - `staleTime: Infinity` が適用され、短時間の連続呼び出しで再フェッチが発生しないこと。
2. **`useAlbums` Hook**:
   - `albumsApi.list()` から `albumMap`（`Map<number, string>`）が正しく構築されること。
   - `getAlbumName(id)` が存在する場合にアルバム名、存在しない場合に `null` を返却すること。
3. **`SpeechBubbleEditorModal` & `SpeechBubbleControls`**:
   - React Query の `queryClient` を利用して `albums`, `fonts`, `speechBubblePresets` が正常に取得・表示されること。
   - モーダルの再オープン時に不要な重複 API 呼び出しが行われないこと。
4. **`BaseImageSelectModal`**:
   - ワークフロー、LoRA、TagSet、アルバム、スナップショット一覧が React Query 経由で正常に取得され、タブ切替時にも既存キャッシュが再利用されること。
5. **`useGenerationStore`**:
   - ワークフロー切替時に `bypassProfilesCache` および `paramSyncGroupsCache` から即座に状態が復元されること。
   - プロファイル作成・更新・削除時にキャッシュが同期更新されること。

---

## 2. 手動検証 (Manual Verification)
1. **アルバム名表示ラグの確認**:
   - 生成画面でスナップショットをアルバム保存後、再度保存モーダルまたはセリフ編集モーダルを開き、前回のアルバム名が瞬時に表示されることを確認する。
2. **ネットワークリクエストの確認 (ブラウザ DevTools)**:
   - アプリ起動時のネットワークタブを確認し、`/config` へのリクエストが重複せず1回のみ行われていることを確認する。
   - セリフ編集モーダルを開閉した際、`/fonts` や `/speech-bubble-presets` がモーダルを開くたびに再リクエストされないことを確認する。
   - ワークフロー A → ワークフロー B → ワークフロー A と切り替えた際、BypassProfiles / ParamSyncGroups の再フェッチが発生せず即座に切り替わることを確認する。
