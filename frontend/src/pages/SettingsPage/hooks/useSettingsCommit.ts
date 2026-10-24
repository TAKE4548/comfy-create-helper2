import { useCallback, useEffect, useRef, useState } from 'react'

export type CommitPhase = 'idle' | 'dirty' | 'invalid' | 'saving' | 'saved' | 'error'

export type CommitState = {
  phase: CommitPhase
  revision: number
  error: string | null
}

type ResourceState = CommitState & {
  snapshot: string | null
  inFlightRevision: number | null
  inFlightSnapshot: string | null
  confirmedSnapshot: string | null
  queuedRevision: number | null
  timer: ReturnType<typeof setTimeout> | null
}

export type SettingsCommitOptions = {
  save: (key: string, snapshot: string) => Promise<void>
}

export function useSettingsCommit({ save }: SettingsCommitOptions) {
  const resources = useRef(new Map<string, ResourceState>())
  const mounted = useRef(true)
  const saveRef = useRef(save)
  saveRef.current = save
  const [, setRenderVersion] = useState(0)

  const publish = useCallback(() => {
    if (mounted.current) setRenderVersion((version) => version + 1)
  }, [])

  const getOrCreate = useCallback((key: string): ResourceState => {
    let current = resources.current.get(key)
    if (!current) {
      current = {
        phase: 'idle',
        revision: 0,
        error: null,
        snapshot: null,
        inFlightRevision: null,
        inFlightSnapshot: null,
        confirmedSnapshot: null,
        queuedRevision: null,
        timer: null,
      }
      resources.current.set(key, current)
    }
    return current
  }, [])

  const clearTimer = useCallback((state: ResourceState) => {
    if (state.timer !== null) {
      clearTimeout(state.timer)
      state.timer = null
    }
  }, [])

  const startRequest = useCallback((key: string, state: ResourceState, revision: number, snapshot: string) => {
    clearTimer(state)
    state.inFlightRevision = revision
    state.inFlightSnapshot = snapshot
    state.phase = 'saving'
    state.error = null
    publish()

    void saveRef.current(key, snapshot).then(() => {
      if (state.inFlightRevision !== revision) return
      state.inFlightRevision = null
      state.inFlightSnapshot = null
      state.confirmedSnapshot = snapshot
      if (!mounted.current) {
        state.queuedRevision = null
        return
      }
      const queuedRevision = state.queuedRevision
      state.queuedRevision = null

      if (
        queuedRevision !== null &&
        queuedRevision === state.revision &&
        state.snapshot !== null &&
        state.snapshot !== snapshot
      ) {
        startRequest(key, state, queuedRevision, state.snapshot)
        return
      }

      if (state.snapshot === snapshot) {
        state.phase = 'saved'
        state.error = null
        state.timer = setTimeout(() => {
          if (state.phase === 'saved' && state.revision === revision) {
            state.phase = 'idle'
            state.snapshot = null
            state.timer = null
            publish()
          }
        }, 2000)
      } else {
        state.phase = state.snapshot === null ? 'invalid' : 'dirty'
        state.error = null
      }
      publish()
    }).catch((error: unknown) => {
      if (state.inFlightRevision !== revision) return
      state.inFlightRevision = null
      state.inFlightSnapshot = null
      state.queuedRevision = null
      if (!mounted.current) return
      state.phase = 'error'
      state.error = error instanceof Error ? error.message : 'Save failed'
      publish()
    })
  }, [clearTimer, publish])

  const stage = useCallback((key: string, snapshot: string | null) => {
    const state = getOrCreate(key)
    clearTimer(state)
    state.revision += 1
    state.snapshot = snapshot
    state.error = null
    state.phase = state.inFlightRevision === null
      ? snapshot === null ? 'invalid' : 'dirty'
      : 'saving'
    publish()
  }, [clearTimer, getOrCreate, publish])

  const commit = useCallback((key: string) => {
    const state = getOrCreate(key)
    if (state.snapshot === null) {
      state.queuedRevision = null
      if (state.inFlightRevision === null) state.phase = 'invalid'
      publish()
      return
    }
    if (state.phase === 'error') return
    if (state.inFlightRevision !== null) {
      if (state.inFlightSnapshot === state.snapshot) {
        state.queuedRevision = null
        state.phase = 'saving'
        publish()
        return
      }
      if (state.inFlightRevision === state.revision || state.queuedRevision === state.revision) return
      state.queuedRevision = state.revision
      state.phase = 'saving'
      publish()
      return
    }
    if (state.snapshot === state.confirmedSnapshot) {
      clearTimer(state)
      state.phase = 'idle'
      state.snapshot = null
      state.error = null
      publish()
      return
    }
    if (state.phase === 'saved' || state.phase === 'idle') return
    startRequest(key, state, state.revision, state.snapshot)
  }, [getOrCreate, publish, startRequest])

  const retry = useCallback((key: string) => {
    const state = resources.current.get(key)
    if (!state || state.phase !== 'error' || state.snapshot === null || state.inFlightRevision !== null) return
    startRequest(key, state, state.revision, state.snapshot)
  }, [startRequest])

  const acceptServer = useCallback((key: string, snapshot: string) => {
    const state = resources.current.get(key)
    if (!state || state.phase !== 'saved' || state.inFlightRevision !== null || state.snapshot !== snapshot) return
    clearTimer(state)
    state.phase = 'idle'
    state.snapshot = null
    state.confirmedSnapshot = snapshot
    state.error = null
    publish()
  }, [clearTimer, publish])

  const getState = useCallback((key: string): CommitState => {
    const state = resources.current.get(key)
    return state
      ? { phase: state.phase, revision: state.revision, error: state.error }
      : { phase: 'idle', revision: 0, error: null }
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      for (const state of resources.current.values()) {
        clearTimer(state)
        state.queuedRevision = null
      }
    }
  }, [clearTimer])

  return { stage, commit, retry, acceptServer, getState }
}
