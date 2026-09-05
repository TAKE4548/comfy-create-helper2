import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SaveAsTagSetModal, extractTagsFromPrompt } from '../SaveAsTagSetModal';
import { tagSetsApi, tagsetCategoriesApi } from '../../../../api/client';

vi.mock('../../../../api/client', () => ({
  tagSetsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  tagsetCategoriesApi: {
    list: vi.fn(),
  },
}));

describe('SaveAsTagSetModal', () => {
  let queryClient: QueryClient;
  const mockOnClose = vi.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
    (tagsetCategoriesApi.list as any).mockResolvedValue([
      { id: 1, name: 'Character', sort_order: 1 },
      { id: 2, name: 'Background', sort_order: 2 },
    ]);
    (tagSetsApi.list as any).mockResolvedValue([
      { id: 10, name: 'Existing TagSet', tags: ['old_tag1', 'old_tag2'], category_id: 1, subsets: [] },
    ]);
  });

  const renderComponent = (props?: Partial<React.ComponentProps<typeof SaveAsTagSetModal>>) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <SaveAsTagSetModal
          role="positive"
          promptText="1girl, blue hair, masterpiece"
          onClose={mockOnClose}
          {...props}
        />
      </QueryClientProvider>
    );
  };

  it('extracts tags correctly from prompt', () => {
    const tags = extractTagsFromPrompt('  tag1,  tag2,   tag3  , , ');
    expect(tags).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('renders modal and parsed tags', async () => {
    renderComponent();

    expect(screen.getByText('タグセットとして保存')).toBeInTheDocument();
    expect(screen.getByText('対象タグ一覧 (3 件)')).toBeInTheDocument();
    expect(screen.getByText('1girl')).toBeInTheDocument();
    expect(screen.getByText('blue hair')).toBeInTheDocument();
    expect(screen.getByText('masterpiece')).toBeInTheDocument();
  });

  it('handles create new tag set submission', async () => {
    (tagSetsApi.create as any).mockResolvedValue({ id: 99, name: 'New Preset' });

    renderComponent();

    const nameInput = screen.getByPlaceholderText('例: アニメ風・青空・背景');
    fireEvent.change(nameInput, { target: { value: 'My New TagSet' } });

    const descInput = screen.getByPlaceholderText('タグセットの用途や詳細メモ');
    fireEvent.change(descInput, { target: { value: 'some note' } });

    const submitBtn = screen.getByRole('button', { name: '新規保存' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tagSetsApi.create).toHaveBeenCalledWith({
        name: 'My New TagSet',
        tags: ['1girl', 'blue hair', 'masterpiece'],
        category_id: undefined,
        description: 'some note',
      });
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('handles update existing tag set with overwrite and confirmation', async () => {
    (tagSetsApi.update as any).mockResolvedValue({ id: 10 });

    renderComponent();

    // Switch to update tab
    fireEvent.click(screen.getByRole('button', { name: '既存セットに反映' }));

    await waitFor(() => {
      expect(screen.getByText('Existing TagSet')).toBeInTheDocument();
    });

    // Select existing tag set
    fireEvent.click(screen.getByText('Existing TagSet'));

    // Confirm button appears
    const confirmBtn = screen.getByRole('button', { name: '反映を確認' });
    fireEvent.click(confirmBtn);

    // Warning and final submit button appear
    expect(screen.getByText(/「Existing TagSet」のタグを上書きしますか？/)).toBeInTheDocument();

    const finalBtn = screen.getByRole('button', { name: '確定して反映' });
    fireEvent.click(finalBtn);

    await waitFor(() => {
      expect(tagSetsApi.update).toHaveBeenCalledWith(10, {
        name: 'Existing TagSet',
        tags: ['1girl', 'blue hair', 'masterpiece'],
        category_id: 1,
        description: undefined,
        subsets: [],
      });
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
