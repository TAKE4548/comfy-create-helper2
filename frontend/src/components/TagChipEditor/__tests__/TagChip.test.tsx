import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { TagChip } from '../TagChip';
import { translateApi } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  translateApi: {
    translatePrompt: vi.fn().mockReturnValue(new Promise(() => {})),
  },
}));

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

  it('adjusts weight by direct number input in submenu in anima mode', () => {
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
    const numInput = screen.getByRole('spinbutton');
    expect(numInput).toHaveValue(1);

    fireEvent.change(numInput, { target: { value: '1.35' } });
    fireEvent.keyDown(numInput, { key: 'Enter', code: 'Enter' });

    expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:1.35)');
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

  it('keeps a removed trailing period from returning after a submenu strength edit in anima mode', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onToggle = vi.fn();
    const onDuplicate = vi.fn();
    const { rerender } = render(
      <TagChip
        id="period-tag"
        text="word."
        enabled={true}
        isAnimaMode={true}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggle={onToggle}
        onDuplicate={onDuplicate}
      />
    );

    fireEvent.click(screen.getByText('word.'));
    const wordInput = screen.getByRole('textbox', { name: 'タグ名編集' });
    fireEvent.change(wordInput, { target: { value: 'word' } });
    fireEvent.keyDown(wordInput, { key: 'Enter', code: 'Enter' });

    expect(onEdit).toHaveBeenLastCalledWith('period-tag', 'word');

    rerender(
      <TagChip
        id="period-tag"
        text="word"
        enabled={true}
        isAnimaMode={true}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggle={onToggle}
        onDuplicate={onDuplicate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '+0.5' }));
    expect(onEdit).toHaveBeenLastCalledWith('period-tag', '(word:1.5)');
  });

  it('preserves a trailing period when strength changes and the tag still has one', () => {
    const onEdit = vi.fn();
    render(
      <TagChip
        id="period-tag"
        text="word."
        enabled={true}
        isAnimaMode={true}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onToggle={vi.fn()}
        onDuplicate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('word.'));
    fireEvent.click(screen.getByRole('button', { name: '+0.5' }));

    expect(onEdit).toHaveBeenCalledWith('period-tag', '(word:1.5).');
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

  it('copies tag text to clipboard when copy button in submenu is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <TagChip
        id="1"
        text="masterpiece, 1girl"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    // Open submenu
    fireEvent.click(screen.getByText('masterpiece, 1girl'));

    const copyBtn = screen.getByRole('button', { name: 'タグをコピー' });
    expect(copyBtn).toBeInTheDocument();

    fireEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith('masterpiece, 1girl');
  });

  it('prevents Backspace, Delete, Space, and Ctrl+D in weight input from triggering parent shortcuts', () => {
    mockOnEdit.mockClear();
    mockOnDelete.mockClear();
    mockOnToggle.mockClear();
    mockOnDuplicate.mockClear();

    render(
      <TagChip
        id="1"
        text="weight-keyboard-tag"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    // Open submenu
    fireEvent.click(screen.getByText('weight-keyboard-tag'));
    const numInput = screen.getByRole('spinbutton');
    expect(numInput).toBeInTheDocument();

    // Backspace in weight input should not delete the chip
    fireEvent.keyDown(numInput, { key: 'Backspace', code: 'Backspace' });
    expect(mockOnDelete).not.toHaveBeenCalled();

    // Delete in weight input should not delete the chip
    fireEvent.keyDown(numInput, { key: 'Delete', code: 'Delete' });
    expect(mockOnDelete).not.toHaveBeenCalled();

    // Space in weight input should not toggle the chip
    fireEvent.keyDown(numInput, { key: ' ', code: 'Space' });
    expect(mockOnToggle).not.toHaveBeenCalled();

    // Ctrl+D in weight input should not duplicate the chip
    fireEvent.keyDown(numInput, { key: 'd', code: 'KeyD', ctrlKey: true });
    expect(mockOnDuplicate).not.toHaveBeenCalled();
  });

  it('stops keyboard propagation in submenu container and closes submenu on Escape', () => {
    render(
      <TagChip
        id="1"
        text="container-key-tag"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    // Open submenu
    fireEvent.click(screen.getByText('container-key-tag'));
    const submenuHeading = screen.getByText('強度 (Weight)');
    const submenuContainer = submenuHeading.closest('.absolute')!;
    expect(submenuContainer).toBeInTheDocument();

    // Delete inside submenu container should not trigger onDelete
    fireEvent.keyDown(submenuContainer, { key: 'Delete', code: 'Delete' });
    expect(mockOnDelete).not.toHaveBeenCalled();

    // Space inside submenu container should not trigger onToggle
    fireEvent.keyDown(submenuContainer, { key: ' ', code: 'Space' });
    expect(mockOnToggle).not.toHaveBeenCalled();

    // Escape inside submenu container should close submenu without triggering parent shortcuts
    fireEvent.keyDown(submenuContainer, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByText('強度 (Weight)')).not.toBeInTheDocument();
  });

  it('applies w-[360px] max-w-[calc(100vw-24px)] class to submenu container (AC-2)', () => {
    render(
      <TagChip
        id="1"
        text="width-tag"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    fireEvent.click(screen.getByText('width-tag'));
    const submenuHeading = screen.getByText('強度 (Weight)');
    const submenuContainer = submenuHeading.closest('.absolute')!;
    expect(submenuContainer).toBeInTheDocument();
    expect(submenuContainer.className).toContain('w-[360px]');
    expect(submenuContainer.className).toContain('max-w-[calc(100vw-24px)]');
  });

  it('renders translation button in submenu header (AC-2)', () => {
    render(
      <TagChip
        id="1"
        text="translate-btn-tag"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    fireEvent.click(screen.getByText('translate-btn-tag'));
    const translateBtn = screen.getByRole('button', { name: 'タグの和訳を閉じる' });
    expect(translateBtn).toBeInTheDocument();
    expect(translateBtn).toHaveTextContent('翻訳');
  });

  it('toggles TagChipTranslationCard when translation button is clicked (AC-3)', () => {
    render(
      <TagChip
        id="1"
        text="translate-open-tag"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    fireEvent.click(screen.getByText('translate-open-tag'));
    const translateBtn = screen.getByRole('button', { name: 'タグの和訳を閉じる' });

    // Opening the submenu automatically opens its translation card.
    expect(screen.getByTestId('translation-card')).toBeInTheDocument();

    // The button still lets the user hide and show the card.
    fireEvent.click(translateBtn);
    expect(screen.queryByTestId('translation-card')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'タグの和訳を表示' })).toBeInTheDocument();

    // Click translation button again -> reopens translation card
    fireEvent.click(screen.getByRole('button', { name: 'タグの和訳を表示' }));
    expect(screen.getByTestId('translation-card')).toBeInTheDocument();
  });

  it('unmounts translation card when parent submenu is closed (AC-8)', () => {
    render(
      <TagChip
        id="1"
        text="translate-close-tag"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    // Open submenu and open translation card
    fireEvent.click(screen.getByText('translate-close-tag'));
    const translateBtn = screen.getByRole('button', { name: 'タグの和訳を閉じる' });
    expect(screen.getByTestId('translation-card')).toBeInTheDocument();

    // Close submenu via Escape on submenu container
    const submenuHeading = screen.getByText('強度 (Weight)');
    const submenuContainer = submenuHeading.closest('.absolute')!;
    fireEvent.keyDown(submenuContainer, { key: 'Escape', code: 'Escape' });

    // Both submenu and translation card should be unmounted
    expect(screen.queryByText('強度 (Weight)')).not.toBeInTheDocument();
    expect(screen.queryByTestId('translation-card')).not.toBeInTheDocument();
  });

  it('translates only committed input and keeps the card open when focus leaves the input', () => {
    const StatefulTagChip = () => {
      const [text, setText] = useState('original-tag');
      return (
        <TagChip
          id="1"
          text={text}
          enabled={true}
          onEdit={(_, nextText) => setText(nextText)}
          onDelete={mockOnDelete}
          onToggle={mockOnToggle}
          onDuplicate={mockOnDuplicate}
        />
      );
    };

    render(<StatefulTagChip />);
    fireEvent.click(screen.getByText('original-tag'));
    expect(screen.getByTestId('translation-card')).toBeInTheDocument();

    const translatePrompt = vi.mocked(translateApi.translatePrompt);
    translatePrompt.mockClear();
    const wordInput = screen.getByRole('textbox', { name: 'タグ名編集' });
    fireEvent.change(wordInput, { target: { value: 'edited-tag' } });
    expect(translatePrompt).not.toHaveBeenCalled();

    fireEvent.keyDown(wordInput, { key: 'Enter', code: 'Enter' });
    expect(translatePrompt).toHaveBeenCalled();
    expect(JSON.stringify(translatePrompt.mock.calls)).toContain('edited-tag');
    expect(screen.getByTestId('translation-card')).toBeInTheDocument();

    const callCountAfterTextCommit = translatePrompt.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '+0.1' }));
    expect(translatePrompt).toHaveBeenCalledTimes(callCountAfterTextCommit);
    expect(screen.getByTestId('translation-card')).toBeInTheDocument();
  });

  it('commits on blur once, while Escape cancels the draft and closes both menu and card', () => {
    const onEdit = vi.fn();
    const StatefulTagChip = () => {
      const [text, setText] = useState('blur-tag');
      return (
        <TagChip
          id="1"
          text={text}
          enabled={true}
          onEdit={(id, nextText) => {
            onEdit(id, nextText);
            setText(nextText);
          }}
          onDelete={mockOnDelete}
          onToggle={mockOnToggle}
          onDuplicate={mockOnDuplicate}
        />
      );
    };

    render(<StatefulTagChip />);
    fireEvent.click(screen.getByText('blur-tag'));
    const wordInput = screen.getByRole('textbox', { name: 'タグ名編集' });
    fireEvent.change(wordInput, { target: { value: 'blurred-tag' } });
    fireEvent.blur(wordInput);
    fireEvent.keyDown(wordInput, { key: 'Enter', code: 'Enter' });

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith('1', 'blurred-tag');
    expect(screen.getByTestId('translation-card')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'タグ名編集' }), {
      target: { value: 'discarded-tag' },
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'タグ名編集' }), {
      key: 'Escape',
      code: 'Escape',
    });
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('translation-card')).not.toBeInTheDocument();
    expect(screen.queryByText('強度 (Weight)')).not.toBeInTheDocument();
  });

  it('closes the submenu and translation card on an outside click', () => {
    render(
      <TagChip
        id="1"
        text="outside-click-tag"
        enabled={true}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        onDuplicate={mockOnDuplicate}
      />
    );

    fireEvent.click(screen.getByText('outside-click-tag'));
    expect(screen.getByTestId('translation-card')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('translation-card')).not.toBeInTheDocument();
    expect(screen.queryByText('強度 (Weight)')).not.toBeInTheDocument();
  });
});
