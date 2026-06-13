import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TagChipEditor } from '../index';

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
});
