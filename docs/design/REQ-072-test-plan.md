# Test Plan: REQ-072 Image Download and Zip Functionality

This test plan defines verification steps for the single download and zip bulk download features.

## 1. Automated Tests
Run frontend linter and production build to verify no compilation or type errors:
```bash
cd frontend
npm run lint
npm run build
```

## 2. Manual Verification
### 2-1. Single Image Download in Album Detail View
1. Open the album list, click on an existing album to view its items.
2. Hover over any image card inside the album detail grid.
3. Verify that a download icon button (Download icon) is displayed next to the delete button.
4. Click the download button and verify that the browser downloads the single image file correctly.

### 2-2. Bulk Download in Snapshot List
1. Open the History tab (Snapshots view).
2. Click "Add to Album" or select multiple image cards to enter select mode.
3. Verify that the `MultiSelectToolbar` appears at the top.
4. Verify that the "一括ダウンロード" button is visible and active when at least one snapshot is selected.
5. Click "一括ダウンロード".
6. Verify that a ZIP file is downloaded, and the name matches `YYYYMMDD_HHmmss.zip` (based on the current download local time).
7. Extract the ZIP file and verify it contains all selected images.

### 2-3. Bulk Download in Album Detail View
1. Open an album, and click the "選択モード" button to enter multi-select mode.
2. Select multiple image cards inside the album.
3. Verify that the `MultiSelectToolbar` appears at the top.
4. Verify that the "一括ダウンロード" button is visible.
5. Click "一括ダウンロード".
6. Verify that a ZIP file is downloaded, and the name matches `[AlbumName].zip` (e.g. `My Favorite Album.zip`).
7. Extract the ZIP file and verify it contains all selected images.

### 2-4. Filename Collision Handling
1. Select multiple snapshots that originate from the same workflow and have the same base filename.
2. Trigger "一括ダウンロード".
3. Extract the ZIP file and verify that no image has been overwritten, and they are named with unique sequential suffixes (e.g. `filename.png`, `filename_1.png`).
