import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

export type SettingsDraftRisk = {
  dirty: boolean
  invalid: boolean
  failed: boolean
  queued: boolean
  inFlight: boolean
}

export type SettingsDraftControls = {
  cancelQueued: () => void
  discardLocal: () => void
}

type DraftEntry = {
  resourceId: string
  risk: SettingsDraftRisk
  controls: SettingsDraftControls
}

export type SettingsDraftSnapshot = {
  risk: SettingsDraftRisk
  entries: DraftEntry[]
}

type Registry = {
  register: (id: string, resourceId: string, controls: SettingsDraftControls) => void
  update: (id: string, risk: SettingsDraftRisk) => void
  clear: (id: string) => void
  unregister: (id: string) => void
  subscribe: (listener: () => void) => () => void
  getVersion: () => number
  getSnapshot: () => SettingsDraftSnapshot
}

const cleanRisk: SettingsDraftRisk = { dirty: false, invalid: false, failed: false, queued: false, inFlight: false }
const emptySnapshot: SettingsDraftSnapshot = { risk: cleanRisk, entries: [] }
const emptyRegistry: Registry = {
  register: () => {},
  update: () => {},
  clear: () => {},
  unregister: () => {},
  subscribe: () => () => {},
  getVersion: () => 0,
  getSnapshot: () => emptySnapshot,
}

const SettingsDraftRegistryContext = createContext<Registry>(emptyRegistry)

export function SettingsDraftProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const entriesRef = useRef(new Map<string, DraftEntry>())
  const listenersRef = useRef(new Set<() => void>())
  const versionRef = useRef(0)

  const notify = useCallback(() => {
    versionRef.current += 1
    for (const listener of listenersRef.current) listener()
  }, [])
  const register = useCallback((id: string, resourceId: string, controls: SettingsDraftControls) => {
    entriesRef.current.set(id, { resourceId, risk: cleanRisk, controls })
    notify()
  }, [notify])
  const update = useCallback((id: string, risk: SettingsDraftRisk) => {
    const entry = entriesRef.current.get(id)
    if (!entry) return
    entriesRef.current.set(id, { ...entry, risk })
    notify()
  }, [notify])
  const clear = useCallback((id: string) => {
    const entry = entriesRef.current.get(id)
    if (entry && Object.values(entry.risk).some(Boolean)) {
      entriesRef.current.set(id, { ...entry, risk: cleanRisk })
      notify()
    }
  }, [notify])
  const unregister = useCallback((id: string) => {
    if (entriesRef.current.delete(id)) notify()
  }, [notify])
  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }, [])
  const getVersion = useCallback(() => versionRef.current, [])
  const getSnapshot = useCallback((): SettingsDraftSnapshot => {
    const entries = [...entriesRef.current.values()]
    const risk = { ...cleanRisk }
    for (const entry of entries) {
      risk.dirty ||= entry.risk.dirty
      risk.invalid ||= entry.risk.invalid
      risk.failed ||= entry.risk.failed
      risk.queued ||= entry.risk.queued
      risk.inFlight ||= entry.risk.inFlight
    }
    return { risk, entries }
  }, [])

  const registry = useMemo(() => ({ register, update, clear, unregister, subscribe, getVersion, getSnapshot }), [register, update, clear, unregister, subscribe, getVersion, getSnapshot])
  return (
    <SettingsDraftRegistryContext.Provider value={registry}>
      {children}
    </SettingsDraftRegistryContext.Provider>
  )
}

export function useSettingsDraftRegistration(
  resourceId: string,
  controls: SettingsDraftControls,
): { update: (risk: SettingsDraftRisk) => void; clear: () => void } {
  const registry = useContext(SettingsDraftRegistryContext)
  const id = `${useId()}:${resourceId}`
  const controlsRef = useRef(controls)
  controlsRef.current = controls

  useLayoutEffect(() => {
    registry.register(id, resourceId, {
      cancelQueued: () => controlsRef.current.cancelQueued(),
      discardLocal: () => controlsRef.current.discardLocal(),
    })
    return () => registry.unregister(id)
  }, [id, registry, resourceId])

  const update = useCallback((risk: SettingsDraftRisk) => registry.update(id, risk), [id, registry])
  const clear = useCallback(() => registry.clear(id), [id, registry])
  return { update, clear }
}

export function useSettingsDraftSnapshot(): SettingsDraftSnapshot {
  const registry = useContext(SettingsDraftRegistryContext)
  useSyncExternalStore(registry.subscribe, registry.getVersion, registry.getVersion)
  return registry.getSnapshot()
}

export function useLatestSettingsDraftSnapshot(): () => SettingsDraftSnapshot {
  return useContext(SettingsDraftRegistryContext).getSnapshot
}
