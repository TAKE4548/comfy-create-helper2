import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TagChipEditor } from '../index';
import { parseToChips } from '../useChipParser';
import { setDeterministicMode, generateChipId } from '../idGenerator';

let mockOnDragStartCallback: any = null;
let mockOnDragCancelCallback: any = null;
let mockOnDragEndCallback: any = null;

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    DndContext: (props: any) => {
      mockOnDragStartCallback = props.onDragStart;
      mockOnDragCancelCallback = props.onDragCancel;
      mockOnDragEndCallback = props.onDragEnd;
      return <div>{props.children}</div>;
    },
  };
});

// Stateful wrapper to test the controlled component behavior
const StatefulTagChipEditor = (props: any) => {
  const [value, setValue] = useState(props.initialValue || '');
  return (
    <TagChipEditor
      value={value}
      onChange={(val) => {
        setValue(val);
        props.onChange?.(val);
      }}
      placeholder={props.placeholder}
      id={props.id}
      isAnimaMode={props.isAnimaMode}
    />
  );
};

describe('TagChipEditor', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    setDeterministicMode(true); // テスト時は決定論的モードをデフォルトにする
    mockOnDragStartCallback = null;
    mockOnDragCancelCallback = null;
    mockOnDragEndCallback = null;
  });

  it('renders chips from initial value and placeholder', () => {
    render(
      <StatefulTagChipEditor
        initialValue="apple, banana"
        onChange={mockOnChange}
        placeholder="Add some tags"
      />
    );

    expect(screen.getByText('apple')).toBeInTheDocument();
    expect(screen.getByText('banana')).toBeInTheDocument();
  });

  it('switches to text mode, allows editing textarea, and updates chips when switching back', () => {
    render(
      <StatefulTagChipEditor
        initialValue="apple, banana"
        onChange={mockOnChange}
      />
    );

    // Switch to text mode
    const switchBtn = screen.getByRole('button', { name: 'テキスト入力モード切替' });
    fireEvent.click(switchBtn);

    // Textarea should be visible
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('apple, banana');

    // Change textarea value
    fireEvent.change(textarea, { target: { value: 'apple, banana, cherry' } });
    
    // It should trigger onChange on the parent component
    expect(mockOnChange).toHaveBeenLastCalledWith('apple, banana, cherry');

    // Switch back to chip mode
    const switchBackBtn = screen.getByRole('button', { name: 'チップモード切替' });
    fireEvent.click(switchBackBtn);

    // Chips should update
    expect(screen.getByText('apple')).toBeInTheDocument();
    expect(screen.getByText('banana')).toBeInTheDocument();
    expect(screen.getByText('cherry')).toBeInTheDocument();
  });

  it('dispatches custom event tag-chip-editor:text-mode-toggle when switching modes if id is provided', () => {
    const eventSpy = vi.fn();
    window.addEventListener('tag-chip-editor:text-mode-toggle', eventSpy);

    render(
      <StatefulTagChipEditor
        initialValue="apple, banana"
        onChange={mockOnChange}
        id="prompt-positive"
      />
    );

    // Switch to text mode
    const switchBtn = screen.getByRole('button', { name: 'テキスト入力モード切替' });
    fireEvent.click(switchBtn);

    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(eventSpy.mock.calls[0][0].detail).toEqual({ id: 'prompt-positive' });

    // Switch back to chip mode
    const switchBackBtn = screen.getByRole('button', { name: 'チップモード切替' });
    fireEvent.click(switchBackBtn);

    expect(eventSpy).toHaveBeenCalledTimes(2);
    expect(eventSpy.mock.calls[1][0].detail).toEqual({ id: 'prompt-positive' });

    window.removeEventListener('tag-chip-editor:text-mode-toggle', eventSpy);
  });

  it('handles custom window events tag-chip-editor:disable-tag and tag-chip-editor:add-tag', () => {
    render(
      <StatefulTagChipEditor
        initialValue="apple, banana"
        onChange={mockOnChange}
      />
    );

    // Dispatch disable-tag event in act
    act(() => {
      window.dispatchEvent(
        new CustomEvent('tag-chip-editor:disable-tag', {
          detail: { tag: 'apple' },
        })
      );
    });

    expect(mockOnChange).toHaveBeenLastCalledWith('banana');
    expect(screen.queryByText('apple')?.closest('div')).toHaveClass('opacity-50');

    // Dispatch add-tag event in act
    act(() => {
      window.dispatchEvent(
        new CustomEvent('tag-chip-editor:add-tag', {
          detail: { tag: 'cherry' },
        })
      );
    });

    expect(mockOnChange).toHaveBeenLastCalledWith('banana, cherry');
    expect(screen.getByText('cherry')).toBeInTheDocument();
  });

  it('handles undo/redo keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)', () => {
    render(
      <StatefulTagChipEditor
        initialValue="apple, banana"
        onChange={mockOnChange}
      />
    );

    const switchBtn = screen.getByRole('button', { name: 'テキスト入力モード切替' });
    const container = switchBtn.closest('div')?.nextSibling as HTMLElement;

    // Simulate adding a tag through input to create history
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'cherry,' } });

    expect(mockOnChange).toHaveBeenLastCalledWith('apple, banana, cherry');
    expect(screen.getByText('cherry')).toBeInTheDocument();
    
    // Now trigger Ctrl+Z (Undo)
    act(() => {
      fireEvent.keyDown(container, { key: 'z', code: 'KeyZ', ctrlKey: true });
    });
    expect(mockOnChange).toHaveBeenLastCalledWith('apple, banana');
    expect(screen.queryByText('cherry')).not.toBeInTheDocument();

    // Trigger Ctrl+Y (Redo)
    act(() => {
      fireEvent.keyDown(container, { key: 'y', code: 'KeyY', ctrlKey: true });
    });
    expect(mockOnChange).toHaveBeenLastCalledWith('apple, banana, cherry');
    expect(screen.getByText('cherry')).toBeInTheDocument();

    // Trigger Ctrl+Z again to undo
    act(() => {
      fireEvent.keyDown(container, { key: 'z', code: 'KeyZ', ctrlKey: true });
    });
    expect(mockOnChange).toHaveBeenLastCalledWith('apple, banana');

    // Trigger Ctrl+Shift+Z (Redo)
    act(() => {
      fireEvent.keyDown(container, { key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true });
    });
    expect(mockOnChange).toHaveBeenLastCalledWith('apple, banana, cherry');
    expect(screen.getByText('cherry')).toBeInTheDocument();
  });

  it('handles drag end and updates chip order', () => {
    render(
      <StatefulTagChipEditor
        initialValue="apple, banana, cherry"
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('apple')).toBeInTheDocument();
    expect(screen.getByText('banana')).toBeInTheDocument();
    expect(screen.getByText('cherry')).toBeInTheDocument();

    // DndContextのonDragEndをシミュレート
    // 決定論的モードでは順に chip-1, chip-2, chip-3 が割り当てられる
    act(() => {
      mockOnDragEndCallback({
        active: { id: 'chip-1' },
        over: { id: 'chip-2' },
      });
    });

    expect(mockOnChange).toHaveBeenLastCalledWith('banana, apple, cherry');
  });

  it('supports Undo/Redo for drag and drop operations', () => {
    render(
      <StatefulTagChipEditor
        initialValue="apple, banana"
        onChange={mockOnChange}
      />
    );

    const switchBtn = screen.getByRole('button', { name: 'テキスト入力モード切替' });
    const container = switchBtn.closest('div')?.nextSibling as HTMLElement;

    // DndContextのonDragEndをシミュレートして順序を入れ替える
    act(() => {
      mockOnDragEndCallback({
        active: { id: 'chip-1' },
        over: { id: 'chip-2' },
      });
    });
    expect(mockOnChange).toHaveBeenLastCalledWith('banana, apple');

    // Ctrl+Z (Undo)
    act(() => {
      fireEvent.keyDown(container, { key: 'z', code: 'KeyZ', ctrlKey: true });
    });
    expect(mockOnChange).toHaveBeenLastCalledWith('apple, banana');

    // Ctrl+Y (Redo)
    act(() => {
      fireEvent.keyDown(container, { key: 'y', code: 'KeyY', ctrlKey: true });
    });
    expect(mockOnChange).toHaveBeenLastCalledWith('banana, apple');
  });

  it('uses deterministic and collision-resistant IDs', () => {
    // 決定論的モード
    setDeterministicMode(true);
    const id1 = generateChipId();
    const id2 = generateChipId();
    expect(id1).toBe('chip-1');
    expect(id2).toBe('chip-2');

    // 通常モード (衝突耐性)
    setDeterministicMode(false);
    const id3 = generateChipId('tag');
    const id4 = generateChipId('tag');
    expect(id3).not.toBe(id4);
    expect(id3.startsWith('tag-')).toBe(true);
  });

  it('removes global custom event listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(
      <StatefulTagChipEditor
        initialValue="apple, banana"
        onChange={mockOnChange}
      />
    );

    unmount();

    // イベントリスナーの削除を確認
    expect(removeSpy).toHaveBeenCalledWith('tag-chip-editor:disable-tag', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('tag-chip-editor:add-tag', expect.any(Function));

    mockOnChange.mockClear();

    // アンマウント後にカスタムイベントを発行しても動作しないことを検証
    act(() => {
      window.dispatchEvent(
        new CustomEvent('tag-chip-editor:add-tag', {
          detail: { tag: 'cherry' },
        })
      );
    });

    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('propagates isAnimaMode to child TagChip components dynamically', () => {
    const { rerender } = render(
      <StatefulTagChipEditor
        initialValue="masterpiece"
        onChange={mockOnChange}
        isAnimaMode={false}
      />
    );

    fireEvent.click(screen.getByText('masterpiece'));
    expect(screen.getByRole('button', { name: '-0.3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+0.3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+0.5' })).not.toBeInTheDocument();

    // Dynamically switch to Anima mode
    rerender(
      <StatefulTagChipEditor
        initialValue="masterpiece"
        onChange={mockOnChange}
        isAnimaMode={true}
      />
    );

    expect(screen.getByRole('button', { name: '-0.5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+0.5' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+0.3' })).not.toBeInTheDocument();
  });

  describe('REQ-220: native chips array and disabled tag preservation', () => {
    it('Case 1: renders disabled chip initially when passed in chips prop', () => {
      const initialChips = [
        { id: 'chip-1', text: 'apple', enabled: true },
        { id: 'chip-2', text: 'banana', enabled: false },
      ];

      render(
        <TagChipEditor
          chips={initialChips}
          onChange={mockOnChange}
        />
      );

      const appleEl = screen.getByText('apple');
      const bananaEl = screen.getByText('banana');
      expect(appleEl).toBeInTheDocument();
      expect(bananaEl).toBeInTheDocument();

      // Banana chip container should have line-through class
      const bananaContainer = bananaEl.closest('div[tabindex]');
      expect(bananaContainer).toHaveClass('line-through');
    });

    it('Case 2: calls onChipsChange with enabled: false when chip is disabled', () => {
      const initialChips = [
        { id: 'chip-1', text: 'apple', enabled: true },
        { id: 'chip-2', text: 'banana', enabled: true },
      ];
      const mockOnChipsChange = vi.fn();

      render(
        <TagChipEditor
          chips={initialChips}
          onChange={mockOnChange}
          onChipsChange={mockOnChipsChange}
        />
      );

      // Click on banana chip to open menu
      fireEvent.click(screen.getByText('banana'));

      // Click the toggle button in the popover menu
      const toggleBtn = screen.getByRole('button', { name: '有効' });
      fireEvent.click(toggleBtn);

      // Verify onChipsChange was called with banana disabled
      expect(mockOnChipsChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ text: 'apple', enabled: true }),
          expect.objectContaining({ text: 'banana', enabled: false }),
        ])
      );
    });

    it('Case 3: synchronizes state without re-parsing when chips prop is updated externally', () => {
      const chipsA = [
        { id: 'chip-1', text: 'apple', enabled: true },
      ];
      const chipsB = [
        { id: 'chip-1', text: 'apple', enabled: true },
        { id: 'chip-2', text: 'cherry', enabled: false },
      ];

      const { rerender } = render(
        <TagChipEditor
          chips={chipsA}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('apple')).toBeInTheDocument();
      expect(screen.queryByText('cherry')).not.toBeInTheDocument();

      // Rerender with chipsB
      rerender(
        <TagChipEditor
          chips={chipsB}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('apple')).toBeInTheDocument();
      const cherryEl = screen.getByText('cherry');
      expect(cherryEl).toBeInTheDocument();
      const cherryContainer = cherryEl.closest('div[tabindex]');
      expect(cherryContainer).toHaveClass('line-through');
    });

    it('Case 4: synchronizes chips when external value string changes while chips prop reference remains unchanged', () => {
      const initialChips = [
        { id: 'chip-1', text: 'apple', enabled: true },
        { id: 'chip-2', text: 'banana', enabled: true },
      ];
      const onChipsChangeMock = vi.fn();

      const { rerender } = render(
        <TagChipEditor
          chips={initialChips}
          value="apple, banana"
          onChipsChange={onChipsChangeMock}
          onChange={() => {}}
        />
      );

      expect(screen.getByText('apple')).toBeInTheDocument();
      expect(screen.getByText('banana')).toBeInTheDocument();
      expect(screen.queryByText('orange')).not.toBeInTheDocument();

      // Rerender with same chips array reference but changed value string (e.g. section copy-paste)
      rerender(
        <TagChipEditor
          chips={initialChips}
          value="orange, grape"
          onChipsChange={onChipsChangeMock}
          onChange={() => {}}
        />
      );

      expect(screen.queryByText('apple')).not.toBeInTheDocument();
      expect(screen.queryByText('banana')).not.toBeInTheDocument();
      expect(screen.getByText('orange')).toBeInTheDocument();
      expect(screen.getByText('grape')).toBeInTheDocument();
    });

    it('Case 5: prevents initial mount notification and does not trigger onChange("") when external value arrives late', () => {
      const onChangeMock = vi.fn();
      const onChipsChangeMock = vi.fn();

      // 初期マウント (value="", chips=[])
      const { rerender } = render(
        <TagChipEditor
          chips={[]}
          value=""
          onChipsChange={onChipsChangeMock}
          onChange={onChangeMock}
        />
      );

      // 初回マウント時に親への逆流通知（onChipsChangeやonChange）が発生しないこと
      expect(onChipsChangeMock).not.toHaveBeenCalled();
      expect(onChangeMock).not.toHaveBeenCalled();

      // 親から遅延して非空の value が渡された場合
      rerender(
        <TagChipEditor
          chips={[]}
          value="masterpiece, best quality"
          onChipsChange={onChipsChangeMock}
          onChange={onChangeMock}
        />
      );

      // 下り同期であり、空文字破壊の onChange("") は発火しないこと
      expect(onChangeMock).not.toHaveBeenCalledWith('');
      // チップが正常に描画されること
      expect(screen.getByText('masterpiece')).toBeInTheDocument();
      expect(screen.getByText('best quality')).toBeInTheDocument();
    });

    it('Case 6: autonomously restores chips when chips=[] but external value is non-empty', () => {
      const { rerender } = render(
        <TagChipEditor
          chips={[]}
          value="cat ears, tail"
          onChange={() => {}}
        />
      );

      // chips=[] だが value があるため自律復元される
      expect(screen.getByText('cat ears')).toBeInTheDocument();
      expect(screen.getByText('tail')).toBeInTheDocument();

      // さらに外部から空チップ配列で上書き同期が走っても、valueが非空なら復元される
      rerender(
        <TagChipEditor
          chips={[]}
          value="cat ears, tail"
          onChange={() => {}}
        />
      );

      expect(screen.getByText('cat ears')).toBeInTheDocument();
      expect(screen.getByText('tail')).toBeInTheDocument();
    });

    it('Case 7: triggers onChange("") only when user explicitly removes all tag chips', () => {
      const onChangeMock = vi.fn();
      const onChipsChangeMock = vi.fn();
      const initialChips = [
        { id: 'c1', text: 'solo', enabled: true },
      ];

      render(
        <TagChipEditor
          chips={initialChips}
          value="solo"
          onChipsChange={onChipsChangeMock}
          onChange={onChangeMock}
        />
      );

      expect(screen.getByText('solo')).toBeInTheDocument();
      expect(onChangeMock).not.toHaveBeenCalled();

      // ユーザーが削除ボタンをクリックして明示的に削除
      const deleteButton = screen.getByLabelText('タグ solo を削除');
      fireEvent.click(deleteButton);

      // ユーザー操作による削除なので onChange("") が発火する
      expect(onChangeMock).toHaveBeenCalledWith('');
      expect(onChipsChangeMock).toHaveBeenCalledWith([]);
      expect(screen.queryByText('solo')).not.toBeInTheDocument();
    });

    it('does not overwrite or revert textarea input when chips prop is provided and re-renders occur in text mode', () => {
      let currentChips = parseToChips('apple, banana');
      const mockOnChipsChange = vi.fn((chips) => { currentChips = chips; });
      const { rerender } = render(
        <TagChipEditor
          value="apple, banana"
          chips={currentChips}
          onChipsChange={mockOnChipsChange}
          onChange={mockOnChange}
        />
      );

      // テキストモードに切り替え
      const switchBtn = screen.getByRole('button', { name: 'テキスト入力モード切替' });
      fireEvent.click(switchBtn);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.value).toBe('apple, banana');

      // 末尾にカンマとスペースを入力
      fireEvent.change(textarea, { target: { value: 'apple, banana, ' } });

      // 親の chips 更新を模倣して rerender
      rerender(
        <TagChipEditor
          value="apple, banana, "
          chips={[...currentChips]}
          onChipsChange={mockOnChipsChange}
          onChange={mockOnChange}
        />
      );

      // 末尾のカンマとスペースが巻き戻されずに維持されること
      expect(textarea.value).toBe('apple, banana, ');
    });
  });

  describe('REQ-298: Drag and drop tag chip reordering and collision handling', () => {
    it('AC-1 & AC-2: drops chip onto another and updates chip order, calling onChipsChange and onChange', () => {
      const onChipsChangeMock = vi.fn();
      const onChangeMock = vi.fn();
      const initialChips = [
        { id: 'c1', text: 'apple', enabled: true },
        { id: 'c2', text: 'banana', enabled: true },
        { id: 'c3', text: 'cherry', enabled: true },
      ];

      render(
        <TagChipEditor
          chips={initialChips}
          value="apple, banana, cherry"
          onChipsChange={onChipsChangeMock}
          onChange={onChangeMock}
        />
      );

      // c1 を c2 の位置へドロップ（順序入れ替え）
      act(() => {
        mockOnDragEndCallback({
          active: { id: 'c1' },
          over: { id: 'c2' },
        });
      });

      expect(onChipsChangeMock).toHaveBeenCalledWith([
        { id: 'c2', text: 'banana', enabled: true },
        { id: 'c1', text: 'apple', enabled: true },
        { id: 'c3', text: 'cherry', enabled: true },
      ]);
      expect(onChangeMock).toHaveBeenCalledWith('banana, apple, cherry');
    });

    it('AC-4: maintains original chip order on drag cancel or when dropping outside (over is null or same)', () => {
      const onChipsChangeMock = vi.fn();
      const onChangeMock = vi.fn();
      const initialChips = [
        { id: 'c1', text: 'apple', enabled: true },
        { id: 'c2', text: 'banana', enabled: true },
      ];

      render(
        <TagChipEditor
          chips={initialChips}
          value="apple, banana"
          onChipsChange={onChipsChangeMock}
          onChange={onChangeMock}
        />
      );

      // ドラッグキャンセル発火
      act(() => {
        mockOnDragCancelCallback();
      });
      expect(onChipsChangeMock).not.toHaveBeenCalled();
      expect(onChangeMock).not.toHaveBeenCalled();

      // 有効範囲外へのドロップ（over: null）
      act(() => {
        mockOnDragEndCallback({
          active: { id: 'c1' },
          over: null,
        });
      });
      expect(onChipsChangeMock).not.toHaveBeenCalled();
      expect(onChangeMock).not.toHaveBeenCalled();

      // 同一要素上でのドロップ（active.id === over.id）
      act(() => {
        mockOnDragEndCallback({
          active: { id: 'c1' },
          over: { id: 'c1' },
        });
      });
      expect(onChipsChangeMock).not.toHaveBeenCalled();
      expect(onChangeMock).not.toHaveBeenCalled();
    });

    it('AC-5: preserves order for single chip on drag end, and blurs active element on drag start to commit inline edit', () => {
      const onChipsChangeMock = vi.fn();
      const onChangeMock = vi.fn();
      const singleChip = [{ id: 'c1', text: 'solo', enabled: true }];

      const { rerender } = render(
        <TagChipEditor
          chips={singleChip}
          value="solo"
          onChipsChange={onChipsChangeMock}
          onChange={onChangeMock}
        />
      );

      // チップが1件のみの状態で onDragEnd が実行されても例外なく元の順序が維持されること
      act(() => {
        mockOnDragEndCallback({
          active: { id: 'c1' },
          over: { id: 'c1' },
        });
      });
      expect(onChipsChangeMock).not.toHaveBeenCalled();
      expect(onChangeMock).not.toHaveBeenCalled();

      // インライン編集用の input にフォーカスがある状態で onDragStart が発火した際、input が blur され編集内容が確定すること
      const multiChips = [
        { id: 'c1', text: 'apple', enabled: true },
        { id: 'c2', text: 'banana', enabled: true },
      ];
      rerender(
        <TagChipEditor
          chips={multiChips}
          value="apple, banana"
          onChipsChange={onChipsChangeMock}
          onChange={onChangeMock}
        />
      );

      // apple をダブルクリックしてインライン編集を開始
      const appleText = screen.getByText('apple');
      fireEvent.doubleClick(appleText);

      const inlineInput = screen.getByDisplayValue('apple');
      expect(inlineInput).toBeInTheDocument();
      inlineInput.focus();
      expect(document.activeElement).toBe(inlineInput);

      // 値を変更
      fireEvent.change(inlineInput, { target: { value: 'orange' } });

      // onDragStart 発火
      act(() => {
        mockOnDragStartCallback();
      });

      // input が blur されて編集内容が確定すること
      expect(document.activeElement).not.toBe(inlineInput);
      expect(screen.getByText('orange')).toBeInTheDocument();
    });

    it('AC-6: ensures existing chip interactions (submenu, delete, text mode) work without interference from drag and drop', () => {
      const onChangeMock = vi.fn();

      render(
        <StatefulTagChipEditor
          initialValue="apple, banana"
          onChange={onChangeMock}
        />
      );

      // 1. タグ名クリックでのサブメニュー開閉
      const appleText = screen.getByText('apple');
      fireEvent.click(appleText);
      expect(screen.getByLabelText('タグ名編集')).toBeInTheDocument();
      // もう一度クリックで閉じる
      fireEvent.click(appleText);
      expect(screen.queryByLabelText('タグ名編集')).not.toBeInTheDocument();

      // 2. 削除ボタンクリックでのタグ削除
      const deleteBanana = screen.getByLabelText('タグ banana を削除');
      fireEvent.click(deleteBanana);
      expect(onChangeMock).toHaveBeenLastCalledWith('apple');
      expect(screen.queryByText('banana')).not.toBeInTheDocument();

      // 3. テキスト編集モードへの切替と編集
      const switchBtn = screen.getByRole('button', { name: 'テキスト入力モード切替' });
      fireEvent.click(switchBtn);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea).toBeInTheDocument();
      expect(textarea.value).toBe('apple');
      fireEvent.change(textarea, { target: { value: 'grape, kiwi' } });
      expect(onChangeMock).toHaveBeenLastCalledWith('grape, kiwi');

      // チップモードへ戻す
      const switchBackBtn = screen.getByRole('button', { name: 'チップモード切替' });
      fireEvent.click(switchBackBtn);
      expect(screen.getByText('grape')).toBeInTheDocument();
      expect(screen.getByText('kiwi')).toBeInTheDocument();
    });

    describe('Anima mode support', () => {
      it('AC-1 & AC-3: commits tag on period outside parenthesis in Anima mode, but ignores bare period and protects parenthesis', () => {
        const onChangeMock = vi.fn();
        render(
          <StatefulTagChipEditor
            initialValue=""
            onChange={onChangeMock}
            isAnimaMode={true}
          />
        );

        const input = screen.getByRole('textbox');

        // 1. 通常のピリオド入力でチップ化（末尾ピリオド保持）
        fireEvent.change(input, { target: { value: 'masterpiece.' } });
        expect(screen.getByText('masterpiece.')).toBeInTheDocument();
        expect(input).toHaveValue('');
        expect(onChangeMock).toHaveBeenCalledWith('masterpiece.');

        // 2. 単なる '.' のみの入力はチップ化せず無視
        fireEvent.change(input, { target: { value: '.' } });
        expect(input).toHaveValue('');
        expect(screen.queryByText('.')).not.toBeInTheDocument();

        // 3. 括弧内のピリオドはチップ化せず入力継続
        fireEvent.change(input, { target: { value: '(solo.' } });
        expect(input).toHaveValue('(solo.');
        expect(screen.queryByText('(solo.')).not.toBeInTheDocument();

        // 4. カンマ入力はカンマを除去してチップ化
        fireEvent.change(input, { target: { value: '1girl,' } });
        expect(screen.getByText('1girl')).toBeInTheDocument();
        expect(input).toHaveValue('');
      });

      it('AC-2: pastes text and splits tags respecting Anima periods and commas', () => {
        const onChangeMock = vi.fn();
        render(
          <StatefulTagChipEditor
            initialValue=""
            onChange={onChangeMock}
            isAnimaMode={true}
          />
        );

        const input = screen.getByRole('textbox');
        const pasteData = {
          getData: vi.fn().mockReturnValue('1girl. red hair, (solo:1.2). blue eyes.'),
        };

        fireEvent.paste(input, { clipboardData: pasteData });

        expect(screen.getByText('1girl.')).toBeInTheDocument();
        expect(screen.getByText('red hair')).toBeInTheDocument();
        expect(screen.getByText('(solo:1.2).')).toBeInTheDocument();
        expect(screen.getByText('blue eyes.')).toBeInTheDocument();
        expect(onChangeMock).toHaveBeenCalledWith('1girl. red hair, (solo:1.2). blue eyes.');
      });

      it('AC-3: supports roundtrip toggle between chip mode and text mode in Anima mode', () => {
        const onChangeMock = vi.fn();
        render(
          <StatefulTagChipEditor
            initialValue="1girl. red hair."
            onChange={onChangeMock}
            isAnimaMode={true}
          />
        );

        expect(screen.getByText('1girl.')).toBeInTheDocument();
        expect(screen.getByText('red hair.')).toBeInTheDocument();

        // テキストモードへ切替
        const switchBtn = screen.getByRole('button', { name: 'テキスト入力モード切替' });
        fireEvent.click(switchBtn);

        const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
        expect(textarea.value).toBe('1girl. red hair.');

        // テキスト編集
        fireEvent.change(textarea, { target: { value: '1girl. blue hair. masterpiece.' } });
        expect(onChangeMock).toHaveBeenLastCalledWith('1girl. blue hair. masterpiece.');

        // チップモードへ戻す
        const switchBackBtn = screen.getByRole('button', { name: 'チップモード切替' });
        fireEvent.click(switchBackBtn);

        expect(screen.getByText('1girl.')).toBeInTheDocument();
        expect(screen.getByText('blue hair.')).toBeInTheDocument();
        expect(screen.getByText('masterpiece.')).toBeInTheDocument();
      });
    });
  });
});


