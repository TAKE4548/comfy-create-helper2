import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PromptSectionClipboardMenu } from '../PromptSectionClipboardMenu';
import { usePromptClipboardStore } from '../../../../store/usePromptClipboardStore';

describe('PromptSectionClipboardMenu', () => {
  const mockOnChangeValue = vi.fn();
  const mockOnOpenSaveAsTagSet = vi.fn();

  beforeEach(() => {
    usePromptClipboardStore.getState().clearHistory();
    usePromptClipboardStore.getState().setPasteMode('append');
    mockOnChangeValue.mockClear();
    mockOnOpenSaveAsTagSet.mockClear();
    vi.restoreAllMocks();
  });

  it('renders copy and menu toggle buttons', () => {
    render(
      <PromptSectionClipboardMenu
        role="positive"
        currentValue="1girl, solo"
        onChangeValue={mockOnChangeValue}
        onOpenSaveAsTagSet={mockOnOpenSaveAsTagSet}
      />
    );

    expect(screen.getByRole('button', { name: 'プロンプトをコピー (positive)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'クリップボード・履歴メニュー (positive)' })).toBeInTheDocument();
  });

  it('copies current value to clipboard when copy button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <PromptSectionClipboardMenu
        role="positive"
        currentValue="1girl, solo"
        onChangeValue={mockOnChangeValue}
      />
    );

    const copyBtn = screen.getByRole('button', { name: 'プロンプトをコピー (positive)' });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledWith('1girl, solo');
    expect(usePromptClipboardStore.getState().history).toContain('1girl, solo');
  });

  it('opens popover when toggle button is clicked and pastes with append mode', () => {
    usePromptClipboardStore.setState({ history: ['anime style, masterpiece'] });

    render(
      <PromptSectionClipboardMenu
        role="positive"
        currentValue="1girl, solo"
        onChangeValue={mockOnChangeValue}
      />
    );

    const menuBtn = screen.getByRole('button', { name: 'クリップボード・履歴メニュー (positive)' });
    fireEvent.click(menuBtn);

    expect(screen.getByText('ペーストモード')).toBeInTheDocument();
    expect(screen.getByText('anime style, masterpiece')).toBeInTheDocument();

    const historyItem = screen.getByText('anime style, masterpiece');
    fireEvent.click(historyItem);

    expect(mockOnChangeValue).toHaveBeenCalledWith('1girl, solo, anime style, masterpiece');
  });

  it('pastes with overwrite mode when selected', () => {
    usePromptClipboardStore.setState({ history: ['overwritten text'] });

    render(
      <PromptSectionClipboardMenu
        role="positive"
        currentValue="1girl, solo"
        onChangeValue={mockOnChangeValue}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'クリップボード・履歴メニュー (positive)' }));
    fireEvent.click(screen.getByRole('button', { name: '上書き' }));

    const historyItem = screen.getByText('overwritten text');
    fireEvent.click(historyItem);

    expect(mockOnChangeValue).toHaveBeenCalledWith('overwritten text');
  });

  it('pastes from OS clipboard directly', async () => {
    const readTextMock = vi.fn().mockResolvedValue('pasted from os');
    Object.assign(navigator, {
      clipboard: {
        readText: readTextMock,
      },
    });

    render(
      <PromptSectionClipboardMenu
        role="positive"
        currentValue="initial prompt"
        onChangeValue={mockOnChangeValue}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'クリップボード・履歴メニュー (positive)' }));
    const osPasteBtn = screen.getByText('クリップボードから貼り付け');

    await act(async () => {
      fireEvent.click(osPasteBtn);
    });

    expect(readTextMock).toHaveBeenCalled();
    expect(mockOnChangeValue).toHaveBeenCalledWith('initial prompt, pasted from os');
  });

  it('calls onOpenSaveAsTagSet when save button is clicked', () => {
    render(
      <PromptSectionClipboardMenu
        role="positive"
        currentValue="1girl, solo"
        onChangeValue={mockOnChangeValue}
        onOpenSaveAsTagSet={mockOnOpenSaveAsTagSet}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'クリップボード・履歴メニュー (positive)' }));
    const saveBtn = screen.getByText('タグセットとして保存');
    fireEvent.click(saveBtn);

    expect(mockOnOpenSaveAsTagSet).toHaveBeenCalledTimes(1);
  });

  it('Red Teaming: handles empty currentValue in append mode without leading commas or spaces', () => {
    usePromptClipboardStore.setState({ history: ['solo, smile'] });

    render(
      <PromptSectionClipboardMenu
        role="positive"
        currentValue=""
        onChangeValue={mockOnChangeValue}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'クリップボード・履歴メニュー (positive)' }));
    fireEvent.click(screen.getByText('solo, smile'));

    expect(mockOnChangeValue).toHaveBeenCalledWith('solo, smile');
  });
});
