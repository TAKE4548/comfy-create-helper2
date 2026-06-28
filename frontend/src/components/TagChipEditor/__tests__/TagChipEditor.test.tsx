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
});
