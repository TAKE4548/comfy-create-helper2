import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { TagChip } from '../TagChip';
import { TagChipViewer } from '../../TagChipViewer';
import { translateApi } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  translateApi: {
    translatePrompt: vi.fn().mockReturnValue(new Promise(() => {})),
  },
}));

const mockSortableState = {
  isDragging: false,
};

vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/sortable')>();
  return {
    ...actual,
    useSortable: (args: any) => {
      const orig = actual.useSortable(args);
      return {
        ...orig,
        ...(mockSortableState.isDragging ? { isDragging: true } : {}),
      };
    },
  };
});

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

    const callsBeforeClick = mockOnDelete.mock.calls.length;
    const deleteBtn = screen.getByRole('button', { name: /タグ deletable-tag を削除/ });
    fireEvent.click(deleteBtn);

    expect(mockOnDelete).toHaveBeenCalledTimes(callsBeforeClick + 1);
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

    await act(async () => {
      fireEvent.click(copyBtn);
    });
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

  it('[REQ-304/AC-2] applies w-[360px] max-w-[calc(100vw-24px)] class to submenu container', () => {
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

  it('[REQ-304/AC-2] renders translation button in submenu header', () => {
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

  it('[REQ-304/AC-3] toggles TagChipTranslationCard when translation button is clicked', () => {
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

  it('[REQ-304/AC-8] unmounts translation card when parent submenu is closed', () => {
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

  describe('Hit-Slop and touch feedback', () => {
    it('[REQ-338/AC-5] applies touch-manipulation, active scale, compact hit-slop, and focus ring to TagChip', () => {
      const { container } = render(
        <TagChip
          id="1"
          text="touch-tag"
          enabled={true}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggle={mockOnToggle}
          onDuplicate={mockOnDuplicate}
        />
      );

      const chipEl = container.querySelector('[data-ux-tag-chip="true"]');
      expect(chipEl).toBeInTheDocument();
      expect(chipEl?.className).toContain('touch-manipulation');
      expect(chipEl?.className).toContain('active:scale-[0.97]');
      expect(chipEl?.className).toContain('transition-transform');
      expect(chipEl?.className).toContain('before:-inset-0.5');
      expect(chipEl?.className).toContain('before:z-0');
      // Must not use wide before:-inset-2 which causes overlap in gap-1.5
      expect(chipEl?.className).not.toContain('before:-inset-2');
      // Accessibility focus ring
      expect(chipEl?.className).toContain('focus-visible:ring-1');
      expect(chipEl?.className).toContain('focus-visible:ring-[#7C6FDD]');
    });

    it('[REQ-338/AC-5] opens submenu when clicking chip body / hit-slop outside text', () => {
      const { container } = render(
        <TagChip
          id="1"
          text="hitslop-tag"
          enabled={true}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggle={mockOnToggle}
          onDuplicate={mockOnDuplicate}
        />
      );

      const chipEl = container.querySelector('[data-ux-tag-chip="true"]')!;
      fireEvent.click(chipEl);
      expect(screen.getByTestId('translation-card')).toBeInTheDocument();
      expect(chipEl.className).toContain('before:-inset-0.5');
      expect(chipEl.className).not.toContain('active:scale-[0.97]');
    });

    it('[REQ-357/AC-1] keeps the drag handle, text, and delete button above the hit-slop layer', () => {
      render(
        <TagChip
          id="layered"
          text="layered-tag"
          enabled={true}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggle={mockOnToggle}
          onDuplicate={mockOnDuplicate}
        />
      );

      expect(screen.getByLabelText('並び替えハンドル').className).toContain('relative z-10');
      expect(screen.getByText('layered-tag').className).toContain('relative z-10');
      expect(screen.getByRole('button', { name: 'タグ layered-tag を削除' }).className).toContain('relative z-10');
    });

    it('[REQ-357/AC-1] keeps the submenu open while step buttons and the enabled toggle are used', () => {
      const onEdit = vi.fn();
      const InteractiveTagChip = () => {
        const [text, setText] = useState('(interactive:1.0)');
        return (
          <TagChip
            id="interactive"
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
      render(<InteractiveTagChip />);

      fireEvent.click(screen.getByText('(interactive:1.0)'));
      fireEvent.click(screen.getByRole('button', { name: '+0.1' }));
      fireEvent.click(screen.getByRole('button', { name: '+0.1' }));
      expect(onEdit).toHaveBeenNthCalledWith(1, 'interactive', '(interactive:1.1)');
      expect(onEdit).toHaveBeenNthCalledWith(2, 'interactive', '(interactive:1.2)');
      expect(screen.getByText('強度 (Weight)')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '有効' }));
      expect(mockOnToggle).toHaveBeenCalledTimes(1);
      expect(mockOnToggle).toHaveBeenCalledWith('interactive');
      expect(screen.getByText('強度 (Weight)')).toBeInTheDocument();
    });

    it('[REQ-357/AC-1] does not toggle menu when clicking drag handle', () => {
      render(
        <TagChip
          id="1"
          text="drag-tag"
          enabled={true}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggle={mockOnToggle}
          onDuplicate={mockOnDuplicate}
        />
      );

      const handle = screen.getByLabelText('並び替えハンドル');
      fireEvent.click(handle);
      expect(screen.queryByTestId('translation-card')).not.toBeInTheDocument();
    });

    it('[REQ-338/AC-5] disables active scale and hit-slop while in editing mode', () => {
      render(
        <TagChip
          id="1"
          text="editing-tag"
          enabled={true}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggle={mockOnToggle}
          onDuplicate={mockOnDuplicate}
        />
      );

      fireEvent.doubleClick(screen.getByText('editing-tag'));
      const chipEl = screen.getByRole('textbox').closest('[data-ux-tag-chip="true"]');
      expect(chipEl?.className).not.toContain('before:-inset-0.5');
      expect(chipEl?.className).not.toContain('active:scale-[0.97]');
    });

    it('[REQ-338/AC-5] TagChipViewer applies compact hit-slop, touch-manipulation, and handles proximity hit snap', () => {
      const onTagClick = vi.fn();
      const { container } = render(
        <TagChipViewer tags={['cat', 'dog']} onTagClick={onTagClick} />
      );

      const chips = container.querySelectorAll('[data-ux-tag-chip="true"]');
      expect(chips).toHaveLength(2);
      expect(chips[0].className).toContain('touch-manipulation');
      expect(chips[0].className).toContain('active:scale-[0.97]');
      expect(chips[0].className).toContain('before:-inset-0.5');
      expect(chips[0].className).not.toContain('before:-inset-2');

      // Proximity Hit Snap via container onTouchEnd
      const chipsContainer = container.querySelector('.flex.flex-wrap')!;

      vi.spyOn(chips[0], 'getBoundingClientRect').mockReturnValue({
        left: 10,
        right: 40,
        top: 10,
        bottom: 30,
        width: 30,
        height: 20,
        x: 10,
        y: 10,
        toJSON: () => {},
      });
      vi.spyOn(chips[1], 'getBoundingClientRect').mockReturnValue({
        left: 50,
        right: 80,
        top: 10,
        bottom: 30,
        width: 30,
        height: 20,
        x: 50,
        y: 10,
        toJSON: () => {},
      });

      // Touch near first chip (x=44, y=20 - in the gap between chip 0 and chip 1, closer to chip 0)
      fireEvent.touchEnd(chipsContainer, {
        changedTouches: [{ clientX: 44, clientY: 20 }],
      });

      expect(onTagClick).toHaveBeenCalledWith('cat');
    });
  });

  describe('REQ-371: TagChip mobile stacking and flip submenu', () => {
    it('[REQ-371/AC-3] sets inline style zIndex to 30 when isDragging is true (below fixed bar z-40)', () => {
      mockSortableState.isDragging = true;
      try {
        const { container } = render(
          <TagChip
            id="drag-1"
            text="dragging-tag"
            enabled={true}
            onEdit={mockOnEdit}
            onDelete={mockOnDelete}
            onToggle={mockOnToggle}
            onDuplicate={mockOnDuplicate}
          />
        );
        const chip = container.querySelector('[data-ux-tag-chip="true"]') as HTMLElement;
        expect(chip).toBeInTheDocument();
        expect(chip.style.zIndex).toBe('30');
      } finally {
        mockSortableState.isDragging = false;
      }
    });

    it('[REQ-371/AC-4] applies bottom-full mb-1.5 when chip is near bottom edge, keeping all controls fully accessible', () => {
      const onEdit = vi.fn();
      const onDelete = vi.fn();
      const onToggle = vi.fn();
      const onDuplicate = vi.fn();

      const { container } = render(
        <TagChip
          id="flip-chip"
          text="flip-tag"
          enabled={true}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
          onDuplicate={onDuplicate}
        />
      );

      const chip = container.querySelector('[data-ux-tag-chip="true"]') as HTMLElement;
      vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue({
        left: 20,
        right: 120,
        top: 680,
        bottom: 720,
        width: 100,
        height: 40,
        x: 20,
        y: 680,
        toJSON: () => {},
      });
      const origHeight = window.innerHeight;
      window.innerHeight = 800;

      try {
        fireEvent.click(chip);

        const submenu = screen.getByLabelText('タグ名編集').closest('.absolute') as HTMLElement;
        expect(submenu).toBeInTheDocument();
        expect(submenu.className).toContain('bottom-full');
        expect(submenu.className).toContain('mb-1.5');
        expect(submenu.className).not.toContain('top-full');
        expect(submenu.className).not.toContain('mt-1.5');

        // All controls in submenu are present and interactive:
        const wordInput = screen.getByLabelText('タグ名編集') as HTMLInputElement;
        expect(wordInput).toBeInTheDocument();
        fireEvent.change(wordInput, { target: { value: 'edited-tag' } });
        fireEvent.keyDown(wordInput, { key: 'Enter' });
        expect(onEdit).toHaveBeenCalledWith('flip-chip', 'edited-tag');

        const copyBtn = screen.getByLabelText('タグをコピー');
        expect(copyBtn).toBeInTheDocument();

        const plusButton = screen.getByRole('button', { name: '+0.1' });
        expect(plusButton).toBeInTheDocument();
        fireEvent.click(plusButton);
        expect(onEdit).toHaveBeenCalled();

        const deleteBtn = screen.getByLabelText('タグ flip-tag を削除');
        expect(deleteBtn).toBeInTheDocument();
      } finally {
        window.innerHeight = origHeight;
      }
    });

    it('[REQ-371/AC-7] maintains top-full mt-1.5 on desktop or when there is sufficient bottom margin', () => {
      const { container } = render(
        <TagChip
          id="normal-chip"
          text="normal-tag"
          enabled={true}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggle={mockOnToggle}
          onDuplicate={mockOnDuplicate}
        />
      );

      const chip = container.querySelector('[data-ux-tag-chip="true"]') as HTMLElement;
      vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue({
        left: 50,
        right: 150,
        top: 50,
        bottom: 90,
        width: 100,
        height: 40,
        x: 50,
        y: 50,
        toJSON: () => {},
      });
      const origHeight = window.innerHeight;
      const origWidth = window.innerWidth;
      window.innerHeight = 900;
      window.innerWidth = 1024;

      try {
        fireEvent.click(chip);

        const submenu = screen.getByLabelText('タグ名編集').closest('.absolute') as HTMLElement;
        expect(submenu).toBeInTheDocument();
        expect(submenu.className).toContain('top-full');
        expect(submenu.className).toContain('mt-1.5');
        expect(submenu.className).not.toContain('bottom-full');
        expect(submenu.className).not.toContain('mb-1.5');
      } finally {
        window.innerHeight = origHeight;
        window.innerWidth = origWidth;
      }
    });

    it('[REQ-371/AC-4] [RedTeam] RT-2 safely falls back upward when chip bottom is at extreme viewport bottom margin without error', () => {
      const { container } = render(
        <TagChip
          id="rt2-chip"
          text="rt2-tag"
          enabled={true}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggle={mockOnToggle}
          onDuplicate={mockOnDuplicate}
        />
      );

      const chip = container.querySelector('[data-ux-tag-chip="true"]') as HTMLElement;
      const origHeight = window.innerHeight;
      window.innerHeight = 800;

      // Chip bottom is within 10px of viewport bottom (bottom = 790 out of 800)
      vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue({
        left: 20,
        right: 120,
        top: 760,
        bottom: 790,
        width: 100,
        height: 30,
        x: 20,
        y: 760,
        toJSON: () => {},
      });

      try {
        expect(() => {
          fireEvent.click(chip);
        }).not.toThrow();

        const submenu = screen.getByLabelText('タグ名編集').closest('.absolute') as HTMLElement;
        expect(submenu).toBeInTheDocument();
        expect(submenu.className).toContain('bottom-full');
        expect(submenu.className).toContain('mb-1.5');
        expect(submenu.className).not.toContain('top-full');
        expect(submenu.className).not.toContain('mt-1.5');
      } finally {
        window.innerHeight = origHeight;
      }
    });

    it('[REQ-371/AC-6] preserves all core TagChip capabilities (display, edit, delete, duplicate, weight adjustment) across standard and lora tags', () => {
      const onEdit = vi.fn();
      const onDelete = vi.fn();
      const onToggle = vi.fn();
      const onDuplicate = vi.fn();

      const { rerender } = render(
        <TagChip
          id="core-1"
          text="(masterpiece:1.2)"
          enabled={true}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
          onDuplicate={onDuplicate}
        />
      );

      expect(screen.getByText('(masterpiece:1.2)')).toBeInTheDocument();

      // Double-click to enter edit mode
      fireEvent.doubleClick(screen.getByText('(masterpiece:1.2)'));
      const editInput = screen.getByDisplayValue('(masterpiece:1.2)');
      expect(editInput).toBeInTheDocument();
      fireEvent.change(editInput, { target: { value: '(masterpiece:1.3)' } });
      fireEvent.keyDown(editInput, { key: 'Enter' });
      expect(onEdit).toHaveBeenCalledWith('core-1', '(masterpiece:1.3)');

      // Delete button
      const deleteBtn = screen.getByLabelText('タグ (masterpiece:1.2) を削除');
      fireEvent.click(deleteBtn);
      expect(onDelete).toHaveBeenCalledWith('core-1');

      // Test LoRA syntax / Tag Set style tag
      rerender(
        <TagChip
          id="lora-1"
          text="<lora:detail_slider:0.8>"
          enabled={true}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
          onDuplicate={onDuplicate}
        />
      );
      expect(screen.getByText('<lora:detail_slider:0.8>')).toBeInTheDocument();

      // Keyboard shortcut: Space to toggle
      const chipEl = screen.getByText('<lora:detail_slider:0.8>').closest('[data-ux-tag-chip="true"]')!;
      fireEvent.keyDown(chipEl, { key: ' ' });
      expect(onToggle).toHaveBeenCalledWith('lora-1');

      // Keyboard shortcut: Ctrl+D to duplicate
      fireEvent.keyDown(chipEl, { key: 'd', ctrlKey: true });
      expect(onDuplicate).toHaveBeenCalledWith('lora-1');
    });
  });
});
