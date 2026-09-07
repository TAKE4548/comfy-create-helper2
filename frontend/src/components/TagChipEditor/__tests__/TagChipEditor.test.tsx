import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TagChipEditor } from '../index';
import { setDeterministicMode, generateChipId } from '../idGenerator';

let mockOnDragEndCallback: any = null;

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    DndContext: (props: any) => {
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
  });
});

