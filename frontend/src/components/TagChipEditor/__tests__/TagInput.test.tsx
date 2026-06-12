import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagInput } from '../TagInput';

describe('TagInput', () => {
  const mockOnChange = vi.fn();
  const mockOnAddTags = vi.fn();
  const mockOnRemoveLast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with placeholder', () => {
    render(
      <TagInput
        value=""
        onChange={mockOnChange}
        onAddTags={mockOnAddTags}
        onRemoveLast={mockOnRemoveLast}
        placeholder="Custom placeholder..."
      />
    );
    expect(screen.getByPlaceholderText('Custom placeholder...')).toBeInTheDocument();
  });

  it('calls onAddTags and clears input when comma is entered', () => {
    render(
      <TagInput
        value="apple"
        onChange={mockOnChange}
        onAddTags={mockOnAddTags}
        onRemoveLast={mockOnRemoveLast}
      />
    );
    const input = screen.getByPlaceholderText('Add tag...');

    // Simulate typing a comma
    fireEvent.change(input, { target: { value: 'apple,' } });

    expect(mockOnAddTags).toHaveBeenCalledWith(['apple']);
    expect(mockOnChange).toHaveBeenCalledWith('');
  });

  it('calls onChange with raw value when typing other characters', () => {
    render(
      <TagInput
        value="appl"
        onChange={mockOnChange}
        onAddTags={mockOnAddTags}
        onRemoveLast={mockOnRemoveLast}
      />
    );
    const input = screen.getByPlaceholderText('Add tag...');

    fireEvent.change(input, { target: { value: 'apple' } });

    expect(mockOnChange).toHaveBeenCalledWith('apple');
    expect(mockOnAddTags).not.toHaveBeenCalled();
  });

  it('calls onAddTags when Enter or Tab is pressed', () => {
    const { rerender } = render(
      <TagInput
        value="  banana  "
        onChange={mockOnChange}
        onAddTags={mockOnAddTags}
        onRemoveLast={mockOnRemoveLast}
      />
    );
    const input = screen.getByPlaceholderText('Add tag...');

    // Press Enter
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(mockOnAddTags).toHaveBeenCalledWith(['banana']);
    expect(mockOnChange).toHaveBeenCalledWith('');

    // Clear mocks before next step in the same test
    vi.clearAllMocks();

    // Re-render and test Tab
    rerender(
      <TagInput
        value="cherry"
        onChange={mockOnChange}
        onAddTags={mockOnAddTags}
        onRemoveLast={mockOnRemoveLast}
      />
    );
    fireEvent.keyDown(input, { key: 'Tab', code: 'Tab' });
    expect(mockOnAddTags).toHaveBeenCalledWith(['cherry']);
    expect(mockOnChange).toHaveBeenCalledWith('');
  });

  it('calls onRemoveLast when Backspace is pressed and value is empty', () => {
    render(
      <TagInput
        value=""
        onChange={mockOnChange}
        onAddTags={mockOnAddTags}
        onRemoveLast={mockOnRemoveLast}
      />
    );
    const input = screen.getByPlaceholderText('Add tag...');

    fireEvent.keyDown(input, { key: 'Backspace', code: 'Backspace' });
    expect(mockOnRemoveLast).toHaveBeenCalled();
  });

  it('does not call onRemoveLast on Backspace if input has value', () => {
    render(
      <TagInput
        value="a"
        onChange={mockOnChange}
        onAddTags={mockOnAddTags}
        onRemoveLast={mockOnRemoveLast}
      />
    );
    const input = screen.getByPlaceholderText('Add tag...');

    fireEvent.keyDown(input, { key: 'Backspace', code: 'Backspace' });
    expect(mockOnRemoveLast).not.toHaveBeenCalled();
  });

  it('splits and adds multiple tags on paste', () => {
    render(
      <TagInput
        value=""
        onChange={mockOnChange}
        onAddTags={mockOnAddTags}
        onRemoveLast={mockOnRemoveLast}
      />
    );
    const input = screen.getByPlaceholderText('Add tag...');

    // Construct a mock ClipboardEvent
    const pasteData = 'apple, banana, , cherry';
    const clipboardData = {
      getData: (type: string) => (type === 'text' ? pasteData : ''),
    };

    fireEvent.paste(input, { clipboardData });

    expect(mockOnAddTags).toHaveBeenCalledWith(['apple', 'banana', 'cherry']);
    expect(mockOnChange).toHaveBeenCalledWith('');
  });
});
