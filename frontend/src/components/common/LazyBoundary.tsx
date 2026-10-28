import {
  Component,
  lazy,
  Suspense,
  useState,
  type ComponentProps,
  type ComponentType,
  type JSX,
  type LazyExoticComponent,
  type ReactNode,
} from 'react'
import { logClientError } from '../../utils/logger'

/** route 要素の Suspense fallback。AppShell 内の main 領域に収まり、ナビは隠さない。 */
export function RouteLoadFallback(): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-0 flex-1 items-center justify-center p-8 text-xs text-zinc-400"
    >
      画面を読み込み中…
    </div>
  )
}

export type LazyModalMode = 'latch' | 'while-open'

export interface LazyModalHostProps<P extends object> {
  isOpen: boolean
  /** latch: 初回 isOpen=true で初めて mount し、以後は閉じても mount を維持（現行「常時 mount・isOpen で null」型）。
   *  while-open: isOpen の間だけ mount、閉じれば unmount（現行「条件 render」型）。 */
  mode: LazyModalMode
  /** モジュール定数の loader。例: () => import('../../components/JobManagementModal').then((m) => ({ default: m.JobManagementModal })) */
  load: () => Promise<{ default: ComponentType<P> }>
  /** latch 型のモーダルは isOpen を含めて渡す（ホストは注入しない）。while-open 型は含めない/含めてもよい（呼び出し側の現行 props に合わせる） */
  modalProps: P
  /** 取得失敗の局所エラーで「閉じる」を押したときに呼ぶ（親の open 状態を閉じる） */
  onClose: () => void
  /** 利用者向け名称。例: 'ジョブ管理' */
  label: string
}

// React.lazy は load 関数ごとに 1 回だけ作り、ホストの再 mount で再 Suspend させない。
const lazyCache = new WeakMap<object, unknown>()

function getLazyComponent<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>
): LazyExoticComponent<ComponentType<P>> {
  const cached = lazyCache.get(load)
  if (cached !== undefined) {
    // Cache entries are only ever written below with the same P for the same load function.
    return cached as LazyExoticComponent<ComponentType<P>>
  }
  const created = lazy(load)
  lazyCache.set(load, created)
  return created
}

const CHUNK_LOAD_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load module script/i

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'ChunkLoadError' || CHUNK_LOAD_ERROR_PATTERN.test(error.message)
}

function ModalLoadFallback({ label }: { label: string }): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-surface-2 px-4 py-2 text-xs text-zinc-300 shadow-lg"
    >
      {label}を読み込み中…
    </div>
  )
}

interface ModalLoadBoundaryProps {
  label: string
  isOpen: boolean
  onClose: () => void
  children: ReactNode
}

interface ModalLoadBoundaryState {
  hasError: boolean
  error: unknown
}

/** chunk 取得失敗だけを局所処理する。それ以外の描画例外は再 throw して外側へ伝える。 */
class ModalLoadBoundary extends Component<ModalLoadBoundaryProps, ModalLoadBoundaryState> {
  state: ModalLoadBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: unknown): ModalLoadBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: unknown): void {
    if (!isChunkLoadError(error)) return
    void logClientError(error, { component: 'LazyModalHost', context: { label: this.props.label } })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    if (!isChunkLoadError(this.state.error)) throw this.state.error
    if (!this.props.isOpen) return null
    return (
      <div
        role="alert"
        className="fixed inset-x-3 bottom-3 z-[70] mx-auto flex max-w-md min-w-0 flex-col gap-2 rounded-xl border border-red-500/40 bg-surface-2 p-4 text-xs text-zinc-200 shadow-2xl"
      >
        <p className="min-w-0 break-words">
          {this.props.label}を読み込めませんでした。ページを再読み込みすると回復する場合があります。
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={this.props.onClose}
            className="relative min-h-11 rounded-lg px-3 text-zinc-300 hover:bg-white/5 before:absolute before:-inset-2 before:content-['']"
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="relative min-h-11 rounded-lg bg-[#7C6FDD] px-3 font-medium text-white before:absolute before:-inset-2 before:content-['']"
          >
            ページを再読み込み
          </button>
        </div>
      </div>
    )
  }
}

export function LazyModalHost<P extends object>({
  isOpen,
  mode,
  load,
  modalProps,
  onClose,
  label,
}: LazyModalHostProps<P>): JSX.Element | null {
  const [latched, setLatched] = useState(isOpen)
  if (isOpen && !latched) setLatched(true)

  const mounted = mode === 'latch' ? latched || isOpen : isOpen
  if (!mounted) return null

  const Lazy = getLazyComponent(load)
  // Single cast: TypeScript cannot relate a generic P to Lazy's PropsWithRef<P> in JSX spread.
  // modalProps is passed through unchanged; the loaded component's props type is P by construction.
  const lazyProps = modalProps as JSX.IntrinsicAttributes & ComponentProps<typeof Lazy>
  return (
    <ModalLoadBoundary label={label} isOpen={isOpen} onClose={onClose}>
      <Suspense fallback={isOpen ? <ModalLoadFallback label={label} /> : null}>
        <Lazy {...lazyProps} />
      </Suspense>
    </ModalLoadBoundary>
  )
}
