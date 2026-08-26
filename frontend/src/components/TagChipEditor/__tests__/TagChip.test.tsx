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

  it('opens submenu on single click and allows toggling enabled status', () => {
    render(
      <TagChip
        id="1"
        text="menu-tag"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    const tagText = screen.getByText('menu-tag');
    fireEvent.click(tagText);

    // Submenu is open: shows weight label and toggle button
    expect(screen.getByText('強度 (Weight)')).toBeInTheDocument();
    const toggleBtn = screen.getByRole('button', { name: '有効' });
    fireEvent.click(toggleBtn);

    expect(mockOnToggle).toHaveBeenCalledWith('1');
  });

  it('adjusts weight using step buttons in standard mode ([-0.3, -0.1, +0.1, +0.3])', () => {
    render(
      <TagChip
        id="1"
        text="1girl"
        enabled={true}
        isAnimaMode={false}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    fireEvent.click(screen.getByText('1girl'));
    expect(screen.getByRole('button', { name: '-0.3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '-0.1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+0.1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+0.3' })).toBeInTheDocument();

    const plusPointThree = screen.getByRole('button', { name: '+0.3' });
    fireEvent.click(plusPointThree);
    expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:1.3)');

    const plusPointOne = screen.getByRole('button', { name: '+0.1' });
    fireEvent.click(plusPointOne);
    expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:1.1)');

    const minusPointOne = screen.getByRole('button', { name: '-0.1' });
    fireEvent.click(minusPointOne);
    expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:0.9)');

    const minusPointThree = screen.getByRole('button', { name: '-0.3' });
    fireEvent.click(minusPointThree);
    expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:0.7)');
  });

  it('adjusts weight using step buttons in anima mode ([-1.0, -0.5, +0.5, +1.0])', () => {
    render(
      <TagChip
        id="1"
        text="1girl"
        enabled={true}
        isAnimaMode={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    fireEvent.click(screen.getByText('1girl'));
    expect(screen.getByRole('button', { name: '-1.0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '-0.5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+0.5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+1.0' })).toBeInTheDocument();

    const plusPointFive = screen.getByRole('button', { name: '+0.5' });
    fireEvent.click(plusPointFive);
    expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:1.5)');

    const plusOne = screen.getByRole('button', { name: '+1.0' });
    fireEvent.click(plusOne);
    expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:2)');

    const minusPointFive = screen.getByRole('button', { name: '-0.5' });
    fireEvent.click(minusPointFive);
    expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:0.5)');

    const minusOne = screen.getByRole('button', { name: '-1.0' });
    fireEvent.click(minusOne);
    expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:0)');
  });

  it('adjusts weight by direct number input in submenu', () => {
    render(
      <TagChip
        id="1"
        text="1girl"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    fireEvent.click(screen.getByText('1girl'));
    const numInput = screen.getByRole('spinbutton');
    expect(numInput).toHaveValue(1);

    fireEvent.change(numInput, { target: { value: '1.35' } });
    fireEvent.keyDown(numInput, { key: 'Enter', code: 'Enter' });

    expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:1.35)');
  });

  it('closes submenu on outside click or Escape key', () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <TagChip
          id="1"
          text="escape-tag"
          enabled={true}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggle={mockOnToggle}
          onDuplicate={mockOnDuplicate}
        />
      </div>
    );

    const tagText = screen.getByText('escape-tag');
    const chipContainer = tagText.closest('div')!;

    // Open submenu
    fireEvent.click(tagText);
    expect(screen.getByText('強度 (Weight)')).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(chipContainer, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByText('強度 (Weight)')).not.toBeInTheDocument();

    // Reopen and click outside
    fireEvent.click(tagText);
    expect(screen.getByText('強度 (Weight)')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('強度 (Weight)')).not.toBeInTheDocument();
  });

  it('allows editing the tag word in the submenu while preserving weight on Enter and blur', () => {
    render(
      <TagChip
        id="1"
        text="(looking back:1.2)"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    // Open submenu
    fireEvent.click(screen.getByText('(looking back:1.2)'));

    const wordInput = screen.getByRole('textbox', { name: 'タグ名編集' });
    expect(wordInput).toHaveValue('looking back');

    // Change word and press Enter
    fireEvent.change(wordInput, { target: { value: 'looking away' } });
    fireEvent.keyDown(wordInput, { key: 'Enter', code: 'Enter' });

    expect(mockOnEdit).toHaveBeenCalledWith('1', '(looking away:1.2)');

    // Test onBlur update
    mockOnEdit.mockClear();
    fireEvent.change(wordInput, { target: { value: 'solo' } });
    fireEvent.blur(wordInput);

    expect(mockOnEdit).toHaveBeenCalledWith('1', '(solo:1.2)');
  });

  it('restores original baseText when word is cleared to empty in submenu', () => {
    render(
      <TagChip
        id="1"
        text="masterpiece"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    // Open submenu
    fireEvent.click(screen.getByText('masterpiece'));

    const wordInput = screen.getByRole('textbox', { name: 'タグ名編集' });
    expect(wordInput).toHaveValue('masterpiece');

    // Clear text and blur
    mockOnEdit.mockClear();
    mockOnDelete.mockClear();
    fireEvent.change(wordInput, { target: { value: '   ' } });
    fireEvent.blur(wordInput);

    expect(mockOnEdit).not.toHaveBeenCalled();
    expect(mockOnDelete).not.toHaveBeenCalled();
    expect(wordInput).toHaveValue('masterpiece');
  });

  it('cancels word edit and closes submenu on Escape key in word input', () => {
    render(
      <TagChip
        id="1"
        text="1girl"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    // Open submenu
    fireEvent.click(screen.getByText('1girl'));

    const wordInput = screen.getByRole('textbox', { name: 'タグ名編集' });
    fireEvent.change(wordInput, { target: { value: '2girls' } });

    // Press Escape
    fireEvent.keyDown(wordInput, { key: 'Escape', code: 'Escape' });

    expect(mockOnEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'タグ名編集' })).not.toBeInTheDocument();
  });

  it('does not trigger parent chip shortcuts (Space, Delete) when typing in word input', () => {
    render(
      <TagChip
        id="1"
        text="test-tag"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    // Open submenu
    fireEvent.click(screen.getByText('test-tag'));

    const wordInput = screen.getByRole('textbox', { name: 'タグ名編集' });
    mockOnToggle.mockClear();
    mockOnDelete.mockClear();

    // Type Space and Delete in word input
    fireEvent.keyDown(wordInput, { key: ' ', code: 'Space' });
    expect(mockOnToggle).not.toHaveBeenCalled();

    fireEvent.keyDown(wordInput, { key: 'Delete', code: 'Delete' });
    expect(mockOnDelete).not.toHaveBeenCalled();
  });
});
