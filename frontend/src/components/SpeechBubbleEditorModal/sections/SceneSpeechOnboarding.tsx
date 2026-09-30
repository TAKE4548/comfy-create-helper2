import { useEffect, useRef, useState } from 'react'
import type { ServerFont, SpeechBubblePreset, SpeechBubblePresetCreate } from '../../../api/types'
import { speechBubblePresetsApi, tagSetsApi } from '../../../api/client'

export interface SceneSpeechOnboardingProps {
  tagSetId: number
  fontList: ServerFont[]
  onPresetCreated: (id: number) => void
  onSkip: () => void
}

const defaultStyle: SpeechBubblePresetCreate = {
  name: '', shape: 'oval', orientation: 'horizontal', font_family: 'Noto Sans JP',
  font_size: 16, text_color: '#1A202C', background_color: '#FFFFFF',
  border_color: '#CBD5E0', border_width: 2,
}

export function SceneSpeechOnboarding({ tagSetId, fontList, onPresetCreated, onSkip }: SceneSpeechOnboardingProps) {
  const fallbackName = `キャラ#${tagSetId} 専用スタイル`
  const [presets, setPresets] = useState<SpeechBubblePreset[]>([])
  const [baseId, setBaseId] = useState('')
  const [form, setForm] = useState<SpeechBubblePresetCreate>({ ...defaultStyle, name: fallbackName })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const savingRef = useRef(false)

  useEffect(() => {
    let active = true
    setForm(previous => ({ ...previous, name: fallbackName }))
    Promise.allSettled([speechBubblePresetsApi.list(), tagSetsApi.list()]).then(([presetResult, tagResult]) => {
      if (!active) return
      if (presetResult.status === 'fulfilled') setPresets(presetResult.value)
      if (tagResult.status === 'fulfilled') {
        const tagSet = tagResult.value.find(item => item.id === tagSetId)
        if (tagSet) {
          setForm(previous => ({
            ...previous,
            name: previous.name === fallbackName ? `${tagSet.name} 専用スタイル` : previous.name,
          }))
        }
      }
    })
    return () => { active = false }
  }, [tagSetId, fallbackName])

  const update = <K extends keyof SpeechBubblePresetCreate>(key: K, value: SpeechBubblePresetCreate[K]) => {
    setForm(previous => ({ ...previous, [key]: value }))
  }

  const selectBase = (id: string) => {
    setBaseId(id)
    const base = presets.find(item => String(item.id) === id)
    if (!base) return
    setForm(previous => ({
      ...previous,
      shape: base.shape, orientation: base.orientation, font_family: base.font_family,
      font_size: base.font_size, text_color: base.text_color,
      background_color: base.background_color, border_color: base.border_color,
      border_width: base.border_width, effects: base.effects,
      tone_preset_id: base.tone_preset_id,
    }))
  }

  const save = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const created = await speechBubblePresetsApi.create({ ...form, tag_set_id: tagSetId })
      onPresetCreated(created.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存に失敗しました')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="scene-speech-onboarding">
      <h3>キャラクター専用スタイル</h3>
      <label>名前
        <input value={form.name} onChange={event => update('name', event.target.value)} />
      </label>
      <label>ベースプリセット
        <select value={baseId} onChange={event => selectBase(event.target.value)}>
          <option value="">なし</option>
          {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select>
      </label>
      <label>形状
        <select value={form.shape} onChange={event => update('shape', event.target.value as SpeechBubblePresetCreate['shape'])}>
          <option value="oval">楕円</option>
          <option value="rounded-rect">角丸</option>
          <option value="burst">爆発</option>
          <option value="cloud">雲</option>
          <option value="none">なし</option>
        </select>
      </label>
      <label>向き
        <select value={form.orientation} onChange={event => update('orientation', event.target.value as SpeechBubblePresetCreate['orientation'])}>
          <option value="horizontal">横書き</option>
          <option value="vertical">縦書き</option>
        </select>
      </label>
      <label>フォント
        <select value={form.font_family} onChange={event => update('font_family', event.target.value)}>
          {!fontList.some(font => font.name === form.font_family) && <option value={form.font_family}>{form.font_family}</option>}
          {fontList.map(font => <option key={font.file_name} value={font.name}>{font.name}</option>)}
        </select>
      </label>
      <label>文字サイズ
        <input type="number" min={12} max={36} value={form.font_size} onChange={event => update('font_size', Number(event.target.value))} />
      </label>
      <label>文字色
        <input type="color" value={form.text_color} onChange={event => update('text_color', event.target.value)} />
      </label>
      <label>背景色
        <input type="color" value={form.background_color} onChange={event => update('background_color', event.target.value)} />
      </label>
      <label>枠色
        <input type="color" value={form.border_color} onChange={event => update('border_color', event.target.value)} />
      </label>
      <label>枠幅
        <input type="number" min={0} max={8} step={0.5} value={form.border_width} onChange={event => update('border_width', Number(event.target.value))} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={saving} onClick={save}>保存</button>
      <button type="button" onClick={onSkip}>スキップ</button>
    </div>
  )
}
