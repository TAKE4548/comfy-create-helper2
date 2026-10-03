import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TagChipTranslationCard } from '../TagChipTranslationCard';
import { translateApi } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  translateApi: {
    translatePrompt: vi.fn(),
  },
}));

describe('TagChipTranslationCard', () => {
  const mockOnClose = vi.fn();
  const originalClipboard = navigator.clipboard;

  beforeAll(() => {
    if (typeof window.PointerEvent === 'undefined') {
      class PointerEvent extends MouseEvent {
        pointerId: number;
        constructor(type: string, params: any = {}) {
          super(type, params);
          this.pointerId = params.pointerId ?? 0;
        }
      }
      window.PointerEvent = PointerEvent as any;
    }
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 768 });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    Object.assign(navigator, { clipboard: originalClipboard });
    vi.useRealTimers();
  });

  it('renders loading state and fetches translation on mount (AC-3)', async () => {
    vi.mocked(translateApi.translatePrompt).mockResolvedValueOnce({
      translated_prompt: '1人の少女、ソロ',
    } as any);

    render(
      <TagChipTranslationCard
        text="1girl, solo"
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText(/和訳を取得中/i)).toBeInTheDocument();
    expect(translateApi.translatePrompt).toHaveBeenCalledWith({
      prompt: '1girl, solo',
      source_lang: 'en',
      target_lang: 'ja',
      repack: false,
    });

    await waitFor(() => {
      expect(screen.getByText('1人の少女、ソロ')).toBeInTheDocument();
    });
    expect(screen.queryByText(/和訳を取得中/i)).not.toBeInTheDocument();
  });

  it('requests clean translation with repack: false when text has weight brackets (AC-5)', async () => {
    vi.mocked(translateApi.translatePrompt).mockResolvedValueOnce({
      translated_prompt: 'アホ毛',
    } as any);

    render(
      <TagChipTranslationCard
        text="((ahoge:1.2))"
        onClose={mockOnClose}
      />
    );

    expect(translateApi.translatePrompt).toHaveBeenCalledWith({
      prompt: '((ahoge:1.2))',
      source_lang: 'en',
      target_lang: 'ja',
      repack: false,
    });

    await waitFor(() => {
      expect(screen.getByText('アホ毛')).toBeInTheDocument();
    });
  });

  it('handles translation API failure and allows retry (AC-4)', async () => {
    vi.mocked(translateApi.translatePrompt).mockRejectedValueOnce(new Error('Network Error'));

    render(
      <TagChipTranslationCard
        text="cat ears"
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Network Error|和訳の取得に失敗しました/i)).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /再試行/i });
    expect(retryButton).toBeInTheDocument();

    vi.mocked(translateApi.translatePrompt).mockResolvedValueOnce({
      translated_prompt: '猫耳',
    } as any);

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('猫耳')).toBeInTheDocument();
    });
  });

  it('calculates initial position and clamps drag movement within viewport (AC-5)', async () => {
    vi.mocked(translateApi.translatePrompt).mockResolvedValueOnce({
      translated_prompt: '猫耳',
    } as any);

    const anchorRect = {
      left: 100,
      top: 100,
      bottom: 130,
      right: 150,
      width: 50,
      height: 30,
    } as DOMRect;

    const { container } = render(
      <TagChipTranslationCard
        text="cat ears"
        onClose={mockOnClose}
        anchorRect={anchorRect}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('猫耳')).toBeInTheDocument();
    });

    const card = container.firstElementChild as HTMLElement;
    expect(card).toBeInTheDocument();
    expect(card.style.left).toBe('100px');
    expect(card.style.top).toBe('138px');

    const header = screen.getByTestId('translation-card-header');

    // Start drag
    fireEvent.pointerDown(header, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    expect(header.setPointerCapture).toHaveBeenCalledWith(1);

    // Drag inside window
    act(() => {
      fireEvent.pointerMove(header, { clientX: 150, clientY: 160, pointerId: 1 });
    });
    expect(card.style.left).toBe('150px');
    expect(card.style.top).toBe('198px');

    // Drag beyond screen boundary (clamp: maxX = 1024 - 320 = 704, maxY = 768 - 200 = 568)
    act(() => {
      fireEvent.pointerMove(header, { clientX: 2000, clientY: 2000, pointerId: 1 });
    });
    expect(card.style.left).toBe('704px');
    expect(card.style.top).toBe('568px');

    // Drag negative
    act(() => {
      fireEvent.pointerMove(header, { clientX: -500, clientY: -500, pointerId: 1 });
    });
    expect(card.style.left).toBe('0px');
    expect(card.style.top).toBe('0px');

    // End drag
    fireEvent.pointerUp(header, { pointerId: 1 });
    expect(header.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('stops pointerdown propagation in text container to prevent card dragging (AC-6)', async () => {
    vi.mocked(translateApi.translatePrompt).mockResolvedValueOnce({
      translated_prompt: 'テスト訳文',
    } as any);

    render(
      <TagChipTranslationCard
        text="test"
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('テスト訳文')).toBeInTheDocument();
    });

    const contentContainer = screen.getByTestId('translation-card-content');
    const pointerEvent = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(pointerEvent, 'stopPropagation');

    contentContainer.dispatchEvent(pointerEvent);
    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('copies translated text to clipboard with 1.5s visual feedback (AC-7)', async () => {
    vi.mocked(translateApi.translatePrompt).mockResolvedValueOnce({
      translated_prompt: '青い空',
    } as any);

    render(
      <TagChipTranslationCard
        text="blue sky"
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('青い空')).toBeInTheDocument();
    });

    vi.useFakeTimers();

    const copyButton = screen.getByRole('button', { name: /コピー|copy/i });
    expect(screen.getByTestId('copy-icon')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(copyButton);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('青い空');
    expect(screen.getByTestId('check-icon')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(screen.getByTestId('copy-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('check-icon')).not.toBeInTheDocument();
  });

  it('calls onClose on close button click, Escape key, and outside click (AC-8)', async () => {
    vi.mocked(translateApi.translatePrompt).mockResolvedValueOnce(new Promise(() => {}));

    const { unmount } = render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <TagChipTranslationCard
          text="cat"
          onClose={mockOnClose}
        />
      </div>
    );

    // 1. Close button
    const closeBtn = screen.getByRole('button', { name: /閉じる|close/i });
    fireEvent.click(closeBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);

    // 2. Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalledTimes(2);

    // 3. Outside click
    fireEvent.mouseDown(screen.getByTestId('outside-area'));
    expect(mockOnClose).toHaveBeenCalledTimes(3);

    // 4. Inside click does NOT call onClose
    const insideHeader = screen.getByTestId('translation-card-header');
    fireEvent.mouseDown(insideHeader);
    expect(mockOnClose).toHaveBeenCalledTimes(3);

    unmount();
  });
});
