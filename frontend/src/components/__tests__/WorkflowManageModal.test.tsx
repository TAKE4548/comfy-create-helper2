import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkflowManageModal } from '../WorkflowManageModal';

function setup(mode: 'rename' | 'copy' = 'rename', onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  const utils = render(
    <WorkflowManageModal mode={mode} currentName="wf" onSubmit={onSubmit} onClose={onClose} isPending={false} />,
  );
  return { onClose, onSubmit, ...utils };
}

describe('WorkflowManageModal', () => {
  it('[REQ-365/AC-9] renders in the common bottom-sheet Modal (single dialog, one handle, max-h-[85dvh], no legacy overlay)', () => {
    const { unmount } = setup('rename');
    const dialog = screen.getByRole('dialog');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(dialog).toHaveAttribute('aria-label', 'ワークフロー名の変更');
    expect(screen.getAllByTestId('modal-sheet-handle')).toHaveLength(1);
    expect(dialog).toHaveAttribute('data-radius-exempt');
    expect(dialog.style.getPropertyValue('--modal-sheet-max-height')).toBe('85dvh');
    expect(dialog.className).toContain('rounded-t-2xl');
    expect(document.querySelectorAll('.modal-backdrop')).toHaveLength(1);
    unmount();
    setup('copy');
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'ワークフローのコピー');
  });

  it('[REQ-365/AC-9] input is focused and selected on open; Escape calls onClose exactly once', () => {
    const { onClose } = setup('rename');
    const input = screen.getByPlaceholderText('名前を入力してください') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('[REQ-365/AC-9] backdrop click, close button and cancel close; submit passes the trimmed name', async () => {
    const a = setup('rename');
    fireEvent.click(document.querySelector('.modal-backdrop') as HTMLElement);
    expect(a.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(a.onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(a.onClose).toHaveBeenCalledTimes(3);
    a.unmount();

    const onSubmit = vi.fn().mockResolvedValue(undefined);
    setup('copy', onSubmit);
    const input = screen.getByPlaceholderText('名前を入力してください') as HTMLInputElement;
    expect(input.value).toBe('wf_copy');
    fireEvent.change(input, { target: { value: '  new_name  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'コピーを作成' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('new_name'));
  });

  it('[REQ-365/AC-9] shows conflict message on 409 error', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('409 conflict'));
    setup('rename', onSubmit);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('その名前はすでに使われています')).toBeInTheDocument();
  });

  it('[REQ-365/AC-9] touch targets expose min-h-[44px]', () => {
    setup('rename');
    expect(screen.getByRole('button', { name: '閉じる' }).className).toContain('min-h-[44px]');
    expect(screen.getByPlaceholderText('名前を入力してください').className).toContain('min-h-[44px]');
    expect(screen.getByRole('button', { name: 'キャンセル' }).className).toContain('min-h-[44px]');
    expect(screen.getByRole('button', { name: '保存' }).className).toContain('min-h-[44px]');
  });
});
