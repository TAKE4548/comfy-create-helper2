import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SceneSpeechModal } from '../SpeechBubbleEditorModal/sections/SceneSpeechModal'
import type { GeneratedSpeechBubbleRead, SceneDraftResponse } from '../../api/types'

vi.mock('../SpeechBubbleEditorModal/sections/SceneSpeechOnboarding', () => ({
  SceneSpeechOnboarding: ({ tagSetId, fontList, onPresetCreated, onSkip }: {
    tagSetId: number; fontList: unknown[]; onPresetCreated: (id: number) => void; onSkip: () => void
  }) => <div>Onboarding {tagSetId} {fontList.length}<button onClick={() => onPresetCreated(7)}>作成</button><button onClick={onSkip}>スキップ</button></div>,
}))

const bubble = (id: string): GeneratedSpeechBubbleRead => ({
  id, text: `台詞${id}`, role: 'main', speaker_name: 'A', is_se: false,
  position: { x: 0, y: 0, w: 100, h: 50 },
  style: { shape: 'oval', textColor: '#000', backgroundColor: '#fff', borderColor: '#000', borderWidth: 1, fontFamily: 'Arial', fontSize: 16 },
})
const result: SceneDraftResponse = {
  scene_interpretation: 'scene', bubbles: [bubble('1'), bubble('2')], vram_unloaded: true,
  tone_samples: [{ text: 'sample', similarity_tier: 'high', thumbnail_url: '/tone.png' }],
  candidate_similar_scenes: [{ snapshot_id: 12, thumbnail_url: '/scene.png', score: 0.8, matched_stems: [], prompt: '候補', bubble_count: 2 }],
}
const handlers = () => ({ onClose: vi.fn(), onRetry: vi.fn(), onApply: vi.fn(), onPresetCreated: vi.fn(), onPresetSkipped: vi.fn(), onReferenceSwitch: vi.fn(), fontList: [] })

describe('SceneSpeechModal', () => {
  it('閉じた状態では描画せず、進捗はPCとモバイルの両方に表示する', () => {
    const props = handlers()
    const { rerender } = render(<SceneSpeechModal {...props} state={null} />)
    expect(screen.queryByTestId('scene-speech-modal')).toBeNull()
    rerender(<SceneSpeechModal {...props} state={{ type: 'progress', elapsedSeconds: 3, steps: [{ key: 'vlm', label: 'VLM推論', status: 'active' }] }} />)
    const root = screen.getByTestId('scene-speech-modal')
    expect(within(root).getAllByText('VLM推論')).toHaveLength(2)
    expect(root.querySelector('.md\\:flex')).not.toBeNull()
    expect(root.querySelector('.md\\:hidden')).not.toBeNull()
  })

  it('Onboardingの完了とスキップを中継する', () => {
    const props = handlers()
    render(<SceneSpeechModal {...props} state={{ type: 'onboarding', tagSetId: 5 }} />)
    fireEvent.click(screen.getAllByText('作成')[0])
    fireEvent.click(screen.getAllByText('スキップ')[0])
    expect(props.onPresetCreated).toHaveBeenCalledWith(7)
    expect(props.onPresetSkipped).toHaveBeenCalledOnce()
  })

  it('エラー種別と詳細を表示して再試行できる', () => {
    const props = handlers()
    render(<SceneSpeechModal {...props} state={{ type: 'error', errorKind: 'timeout', message: '時間切れ' }} />)
    expect(screen.getAllByText('タイムアウト')).toHaveLength(2)
    expect(screen.getAllByText('時間切れ')).toHaveLength(2)
    fireEvent.click(screen.getAllByText('再試行')[0])
    expect(props.onRetry).toHaveBeenCalledOnce()
  })

  it('選択したバブルだけを適用し、参照候補に切り替えられる', () => {
    const props = handlers()
    render(<SceneSpeechModal {...props} state={{ type: 'review', result }} />)
    expect(screen.getAllByText('系統A')).toHaveLength(2)
    expect(screen.getAllByText('系統B')).toHaveLength(2)
    fireEvent.click(screen.getAllByLabelText('台詞2')[0])
    fireEvent.click(screen.getAllByText('キャンバスに反映')[0])
    expect(props.onApply).toHaveBeenCalledWith([result.bubbles[0]])
    fireEvent.click(screen.getAllByText('このシーンで再生成')[0])
    expect(props.onReferenceSwitch).toHaveBeenCalledWith(12)
  })

  it('高・中・低の参照にスナップ番号を表示する', () => {
    const tiers: SceneDraftResponse = {
      ...result,
      tone_samples: [
        { snapshot_id: 11, text: '高い例', similarity_tier: 'high' },
        { snapshot_id: 22, text: '中の例', similarity_tier: 'mid' },
        { snapshot_id: 33, text: '低い例', similarity_tier: 'low' },
      ],
    }
    render(<SceneSpeechModal {...handlers()} state={{ type: 'review', result: tiers }} />)
    for (const caption of ['高: スナップ#11', '中: スナップ#22', '低: スナップ#33']) {
      expect(screen.getAllByText(caption)).toHaveLength(2)
    }
  })

  it('参照サンプルが空でも系統Aに参照なしを表示する', () => {
    render(<SceneSpeechModal {...handlers()} state={{ type: 'review', result: { ...result, tone_samples: [] } }} />)
    expect(screen.getAllByText('系統A')).toHaveLength(2)
    expect(screen.getAllByText('参照なし')).toHaveLength(2)
  })
})
