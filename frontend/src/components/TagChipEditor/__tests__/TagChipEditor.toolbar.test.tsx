import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TagChipEditor } from '../index';

describe('TagChipEditor toolbar', () => {
  it('keeps the default captions and mode action when toolbar props are omitted', () => {
    render(<TagChipEditor value="apple" />);

    expect(screen.getByText('Chips Mode')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'テキスト入力モード切替' })).toBeInTheDocument();
  });

  it('renders the supplied start content before the mode action and invokes it once', () => {
    const onClick = vi.fn();
    render(
      <TagChipEditor
        value="apple"
        toolbarStart={<button type="button" onClick={onClick}>追加</button>}
      />
    );

    const toolbar = document.querySelector('[data-prompt-toolbar=""]');
    expect(toolbar).toBeInTheDocument();
    expect(toolbar?.firstElementChild).toHaveTextContent('追加');
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('omits only the mode caption when requested and keeps undo hints and one mode action', () => {
    render(<TagChipEditor value="apple" showModeStatus={false} />);

    expect(screen.queryByText('Chips Mode')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'テキスト入力モード切替' })).toHaveLength(1);
    expect(document.querySelector('[data-prompt-toolbar=""]')).toHaveClass('flex-wrap');
    expect(document.querySelector('[data-prompt-toolbar=""]')?.className).not.toMatch(/overflow-hidden/);
  });

  it('preserves chips and text mode callbacks when the caption is hidden', () => {
    const onChange = vi.fn();
    const onChipsChange = vi.fn();
    const onTextModeToggle = vi.fn();
    const ControlledEditor = () => {
      const [value, setValue] = useState('apple');
      return (
        <TagChipEditor
          value={value}
          chips={[{ id: 'apple-id', text: 'apple', enabled: false }]}
          onChange={(nextValue) => {
            onChange(nextValue);
            setValue(nextValue);
          }}
          onChipsChange={onChipsChange}
          onTextModeToggle={onTextModeToggle}
          showModeStatus={false}
        />
      );
    };
    render(<ControlledEditor />);

    fireEvent.click(screen.getByRole('button', { name: 'テキスト入力モード切替' }));
    expect(screen.getByRole('textbox')).toHaveValue('apple');
    expect(onTextModeToggle).toHaveBeenLastCalledWith(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'pear' } });
    expect(onChange).toHaveBeenCalledWith('pear');
    expect(onChipsChange).toHaveBeenCalledWith([{ id: expect.any(String), text: 'pear', enabled: true }]);
    fireEvent.click(screen.getByRole('button', { name: 'チップモード切替' }));
    expect(screen.getByText('pear')).toBeInTheDocument();
    expect(onTextModeToggle).toHaveBeenLastCalledWith(false);
  });
});
