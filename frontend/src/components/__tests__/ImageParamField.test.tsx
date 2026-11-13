import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ImageParamField } from '../ImageParamField'
import { resetTestStore } from '../../test/utils/storeHelpers'
import { createTestQueryClient } from '../../test/utils/queryHelpers'
import { useGenerationStore } from '../../store/useGenerationStore'

const idOf = (c: string) => `${c.repeat(64)}.png`
const tokenOf = (c: string) => `refimg:${idOf(c)}`
const readOf = (c: string) => ({ ref_id: idOf(c), token: tokenOf(c), width: 1, height: 1, size_bytes: 1 })

function jsonRes(status: number, body: unknown) {
  const text = JSON.stringify(body)
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => body }
}

type Props = React.ComponentProps<typeof ImageParamField>

function mount(props: Partial<Props> = {}) {
  const onChange = vi.fn()
  const client = createTestQueryClient()
  const ui = (p: Partial<Props>) => (
    <QueryClientProvider client={client}>
      <ImageParamField label="Ref" fieldKey="ref_image" value={undefined} onChange={onChange} {...props} {...p} />
    </QueryClientProvider>
  )
  const utils = render(ui({}))
  return { onChange, rerenderWith: (p: Partial<Props>) => utils.rerender(ui(p)) }
}

const png = () => new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })

describe('ImageParamField', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  const original = global.fetch
  beforeEach(() => {
    resetTestStore({ comfyHistoryImages: ['/view?filename=a.png&subfolder=s&type=output&t=1'] })
    fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })
  afterEach(() => {
    global.fetch = original
  })

  const routeImport = (c: string) =>
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/snapshots') ? jsonRes(200, []) : jsonRes(201, readOf(c)))

  it('[REQ-427/AC-4] picker selection from history calls onChange(token) and thumbnail follows value', async () => {
    routeImport('a')
    const { onChange, rerenderWith } = mount()
    fireEvent.click(screen.getByRole('button', { name: '履歴/スナップショットから選択' }))
    fireEvent.click(await screen.findByTestId('ref-picker-history-0'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(tokenOf('a')))
    rerenderWith({ value: tokenOf('a') })
    const img = screen.getByAltText('選択中の参照画像')
    expect(img.getAttribute('src')).toBe(`/api/ref-images/${idOf('a')}/thumbnail`)
  })

  it('[REQ-427/AC-5] file input upload posts FormData to /ref-images/upload then onChange(token)', async () => {
    fetchMock.mockResolvedValue(jsonRes(201, readOf('b')))
    const { onChange } = mount()
    const input = screen.getByTestId('image-param-ref_image').querySelector('input[type=file]') as HTMLInputElement
    expect(input.getAttribute('accept')).toBe('image/png,image/jpeg,image/webp')
    fireEvent.change(input, { target: { files: [png()] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(tokenOf('b')))
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/ref-images/upload')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('[REQ-427/AC-5] dropping an image file uploads it', async () => {
    fetchMock.mockResolvedValue(jsonRes(201, readOf('c')))
    const { onChange } = mount()
    fireEvent.drop(screen.getByTestId('image-param-ref_image'), { dataTransfer: { files: [png()] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(tokenOf('c')))
    expect(String(fetchMock.mock.calls[0][0])).toContain('/ref-images/upload')
  })

  it('[REQ-427/AC-5] paste on focused field uploads; paste outside the field is ignored', async () => {
    fetchMock.mockResolvedValue(jsonRes(201, readOf('d')))
    const { onChange } = mount()
    fireEvent.paste(document.body, { clipboardData: { files: [png()], items: [] } })
    expect(fetchMock).toHaveBeenCalledTimes(0)
    const field = screen.getByTestId('image-param-ref_image')
    field.focus()
    fireEvent.paste(field, { clipboardData: { files: [], items: [{ kind: 'file', type: 'image/png', getAsFile: () => png() }] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(tokenOf('d')))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('[REQ-427/AC-5] non-image file shows alert, no fetch, no onChange, keeps thumbnail, sets error toast', async () => {
    const { onChange } = mount({ value: tokenOf('e') })
    const before = screen.getByAltText('選択中の参照画像').getAttribute('src')
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' })
    fireEvent.drop(screen.getByTestId('image-param-ref_image'), { dataTransfer: { files: [txt] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('画像ファイル（PNG / JPEG / WebP）を指定してください')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByAltText('選択中の参照画像').getAttribute('src')).toBe(before)
    await waitFor(() => expect(useGenerationStore.getState().errorToast?.type).toBe('error'))
  })

  it('[REQ-427/AC-5] oversize file is rejected without fetch', async () => {
    const { onChange } = mount()
    const big = new File(['x'], 'big.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 20 * 1024 * 1024 + 1 })
    fireEvent.drop(screen.getByTestId('image-param-ref_image'), { dataTransfer: { files: [big] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('画像サイズが上限（20MB）を超えています')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('[REQ-427/AC-5] fetch 500 and reject keep value and show alert', async () => {
    const { onChange } = mount({ value: tokenOf('e') })
    const field = screen.getByTestId('image-param-ref_image')
    fetchMock.mockResolvedValueOnce(jsonRes(500, { detail: 'boom' }))
    fireEvent.drop(field, { dataTransfer: { files: [png()] } })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    fetchMock.mockRejectedValueOnce(new Error('network'))
    fireEvent.drop(field, { dataTransfer: { files: [png()] } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByAltText('選択中の参照画像').getAttribute('src')).toContain(idOf('e'))
    await waitFor(() => expect(useGenerationStore.getState().errorToast?.type).toBe('error'))
  })

  it('[REQ-427/AC-5] stale response of earlier upload is discarded', async () => {
    let resolveFirst: (v: unknown) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
    fetchMock.mockResolvedValueOnce(jsonRes(201, readOf('2')))
    const { onChange } = mount()
    const field = screen.getByTestId('image-param-ref_image')
    fireEvent.drop(field, { dataTransfer: { files: [png()] } })
    fireEvent.drop(field, { dataTransfer: { files: [png()] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(tokenOf('2')))
    await act(async () => { resolveFirst(jsonRes(201, readOf('1'))) })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(tokenOf('2'))
  })

  it('[REQ-427/AC-3] disabled disables buttons and ignores drop/paste', () => {
    const { onChange } = mount({ disabled: true })
    const field = screen.getByTestId('image-param-ref_image')
    field.querySelectorAll('button').forEach((b) => expect(b).toBeDisabled())
    fireEvent.drop(field, { dataTransfer: { files: [png()] } })
    fireEvent.paste(field, { clipboardData: { files: [png()], items: [] } })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('[REQ-427/AC-3] unspecified placeholder and 44px/touch classes on buttons', () => {
    mount({ mobile: true })
    expect(screen.getByText('未指定')).toBeInTheDocument()
    const btns = screen.getByTestId('image-param-ref_image').querySelectorAll('button')
    expect(btns.length).toBe(2)
    btns.forEach((b) => {
      expect(b.className).toContain('min-h-11')
      expect(b.className).toContain('touch-manipulation')
    })
  })

  it('[REQ-427/AC-4] onPickerOpenChange is notified on open and on each close path', async () => {
    const onPickerOpenChange = vi.fn()
    mount({ onPickerOpenChange })
    const open = () => fireEvent.click(screen.getByRole('button', { name: '履歴/スナップショットから選択' }))
    open()
    expect(onPickerOpenChange).toHaveBeenLastCalledWith(true)
    await screen.findByRole('dialog')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(onPickerOpenChange).toHaveBeenLastCalledWith(false))
    open()
    expect(onPickerOpenChange).toHaveBeenLastCalledWith(true)
    fireEvent.click(await screen.findByRole('button', { name: '閉じる' }))
    await waitFor(() => expect(onPickerOpenChange).toHaveBeenLastCalledWith(false))
    routeImport('a')
    open()
    fireEvent.click(await screen.findByTestId('ref-picker-history-0'))
    await waitFor(() => expect(onPickerOpenChange).toHaveBeenLastCalledWith(false))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
