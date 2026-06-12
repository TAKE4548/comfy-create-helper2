import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagChip } from '../TagChip';

describe('TagChip', () => {
  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnToggle = vi.fn();
  const mockOnDuplicate = vi.fn();

  it('renders text and active/inactive styles correctly', () => {
    // Active style
    const { rerender } = render(
      <TagChip
        id="1"
        text="active-tag"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );
    expect(screen.getByText('active-tag')).toBeInTheDocument();
    
    // Inactive style
    rerender(
      <TagChip
        id="1"
        text="inactive-tag"
        enabled={false}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );
    expect(screen.getByText('inactive-tag')).toBeInTheDocument();
  });

  it('enters editing mode on double click, focuses input, and calls onEdit on submit', () => {
    render(
      <TagChip
        id="1"
        text="editable-tag"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    const tagText = screen.getByText('editable-tag');
    fireEvent.doubleClick(tagText);

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('editable-tag');

    // Type and press Enter
    fireEvent.change(input, { target: { value: 'edited-tag' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(mockOnEdit).toHaveBeenCalledWith('1', 'edited-tag');
  });

  it('calls onDelete if text is edited to be empty', () => {
    render(
      <TagChip
        id="1"
        text="editable-tag"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    const tagText = screen.getByText('editable-tag');
    fireEvent.doubleClick(tagText);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(mockOnDelete).toHaveBeenCalledWith('1');
  });

  it('calls onDelete when the delete button is clicked', () => {
    render(
      <TagChip
        id="1"
        text="deletable-tag"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    const deleteBtn = screen.getByRole('button', { name: /タグ deletable-tag を削除/ });
    fireEvent.click(deleteBtn);

    expect(mockOnDelete).toHaveBeenCalledWith('1');
  });

  it('calls onToggle, onDelete, and onDuplicate based on keyboard shortcuts when not editing', () => {
    render(
      <TagChip
        id="1"
        text="shortcut-tag"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    const chipContainer = screen.getByText('shortcut-tag').closest('div')!;

    // Space to toggle
    fireEvent.keyDown(chipContainer, { key: ' ', code: 'Space' });
    expect(mockOnToggle).toHaveBeenCalledWith('1');

    // Delete key to delete
    fireEvent.keyDown(chipContainer, { key: 'Delete', code: 'Delete' });
    expect(mockOnDelete).toHaveBeenCalledWith('1');

    // Ctrl+D to duplicate
    fireEvent.keyDown(chipContainer, { key: 'd', code: 'KeyD', ctrlKey: true });
    expect(mockOnDuplicate).toHaveBeenCalledWith('1');
  });
});
