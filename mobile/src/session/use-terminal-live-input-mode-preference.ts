import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadDisabledTerminalLiveInputHandles,
  saveDisabledTerminalLiveInputHandles
} from '../storage/preferences'
import {
  applyDisabledTerminalLiveInputHandles,
  defaultTerminalLiveInputHandles,
  filterTerminalLiveInputDefaultCandidates,
  pruneTerminalLiveInputHandles
} from '../terminal/terminal-live-input'

type UseTerminalLiveInputModePreferenceOptions = {
  readonly hostId: string
  readonly worktreeId: string
}

export function useTerminalLiveInputModePreference({
  hostId,
  worktreeId
}: UseTerminalLiveInputModePreferenceOptions) {
  const [liveInputTerminalHandles, setLiveInputTerminalHandles] = useState<Set<string>>(
    () => new Set()
  )
  const liveInputTerminalHandlesRef = useRef<Set<string>>(new Set())
  const defaultedLiveInputTerminalHandlesRef = useRef<Set<string>>(new Set())
  const disabledLiveInputTerminalHandlesRef = useRef<Set<string>>(new Set())
  const disabledLiveInputHydratedRef = useRef(false)
  const disabledLiveInputEditedDuringHydrationRef = useRef(false)
  const pendingLiveInputDefaultHandlesRef = useRef<Set<string>>(new Set())

  const defaultTerminalHandlesToLiveInput = useCallback((handles: readonly string[]) => {
    if (!disabledLiveInputHydratedRef.current) {
      for (const handle of handles) {
        pendingLiveInputDefaultHandlesRef.current.add(handle)
      }
      return
    }
    const defaultableHandles = filterTerminalLiveInputDefaultCandidates(
      handles,
      disabledLiveInputTerminalHandlesRef.current
    )
    const result = defaultTerminalLiveInputHandles(
      liveInputTerminalHandlesRef.current,
      defaultedLiveInputTerminalHandlesRef.current,
      defaultableHandles
    )
    if (!result.changed) {
      return
    }
    const nextEnabledHandles = new Set(result.enabledHandles)
    const nextDefaultedHandles = new Set(result.defaultedHandles)
    liveInputTerminalHandlesRef.current = nextEnabledHandles
    defaultedLiveInputTerminalHandlesRef.current = nextDefaultedHandles
    setLiveInputTerminalHandles(nextEnabledHandles)
  }, [])

  const persistDisabledLiveInputHandles = useCallback(() => {
    void saveDisabledTerminalLiveInputHandles(
      hostId,
      worktreeId,
      disabledLiveInputTerminalHandlesRef.current
    ).catch(() => {})
  }, [hostId, worktreeId])

  const pruneTerminalHandlesFromLiveInput = useCallback((liveHandles: ReadonlySet<string>) => {
    const result = pruneTerminalLiveInputHandles(
      liveInputTerminalHandlesRef.current,
      defaultedLiveInputTerminalHandlesRef.current,
      liveHandles
    )
    let prunedDisabledHandles = false
    for (const handle of disabledLiveInputTerminalHandlesRef.current) {
      if (liveHandles.has(handle)) {
        continue
      }
      disabledLiveInputTerminalHandlesRef.current.delete(handle)
      prunedDisabledHandles = true
    }
    if (prunedDisabledHandles) {
      persistDisabledLiveInputHandles()
    }
    if (!result.changed) {
      return
    }
    const nextEnabledHandles = new Set(result.enabledHandles)
    const nextDefaultedHandles = new Set(result.defaultedHandles)
    liveInputTerminalHandlesRef.current = nextEnabledHandles
    defaultedLiveInputTerminalHandlesRef.current = nextDefaultedHandles
    setLiveInputTerminalHandles(nextEnabledHandles)
  }, [persistDisabledLiveInputHandles])

  const clearTerminalLiveInputDefault = useCallback(
    (handle: string) => {
      const liveHandles = new Set([
        ...liveInputTerminalHandlesRef.current,
        ...defaultedLiveInputTerminalHandlesRef.current
      ])
      liveHandles.delete(handle)
      if (disabledLiveInputTerminalHandlesRef.current.delete(handle)) {
        persistDisabledLiveInputHandles()
      }
      pruneTerminalHandlesFromLiveInput(liveHandles)
    },
    [persistDisabledLiveInputHandles, pruneTerminalHandlesFromLiveInput]
  )

  const toggleTerminalLiveInput = useCallback(
    (handle: string): boolean => {
      const nextEnabled = !liveInputTerminalHandlesRef.current.has(handle)
      disabledLiveInputEditedDuringHydrationRef.current = true
      if (nextEnabled) {
        disabledLiveInputTerminalHandlesRef.current.delete(handle)
      } else {
        disabledLiveInputTerminalHandlesRef.current.add(handle)
      }
      persistDisabledLiveInputHandles()
      setLiveInputTerminalHandles((prev) => {
        const next = new Set(prev)
        if (nextEnabled) {
          next.add(handle)
        } else {
          next.delete(handle)
        }
        liveInputTerminalHandlesRef.current = next
        return next
      })
      return nextEnabled
    },
    [persistDisabledLiveInputHandles]
  )

  useEffect(() => {
    liveInputTerminalHandlesRef.current = new Set()
    defaultedLiveInputTerminalHandlesRef.current = new Set()
    disabledLiveInputTerminalHandlesRef.current = new Set()
    disabledLiveInputHydratedRef.current = false
    disabledLiveInputEditedDuringHydrationRef.current = false
    pendingLiveInputDefaultHandlesRef.current = new Set()
    setLiveInputTerminalHandles(new Set())

    let disposed = false
    void loadDisabledTerminalLiveInputHandles(hostId, worktreeId).then((disabledHandles) => {
      if (disposed) {
        return
      }
      const hydratedDisabledHandles = disabledLiveInputEditedDuringHydrationRef.current
        ? disabledLiveInputTerminalHandlesRef.current
        : disabledHandles
      disabledLiveInputTerminalHandlesRef.current = hydratedDisabledHandles
      disabledLiveInputHydratedRef.current = true
      const result = applyDisabledTerminalLiveInputHandles(
        liveInputTerminalHandlesRef.current,
        defaultedLiveInputTerminalHandlesRef.current,
        hydratedDisabledHandles
      )
      const nextEnabledHandles = new Set(result.enabledHandles)
      const nextDefaultedHandles = new Set(result.defaultedHandles)
      liveInputTerminalHandlesRef.current = nextEnabledHandles
      defaultedLiveInputTerminalHandlesRef.current = nextDefaultedHandles
      setLiveInputTerminalHandles(nextEnabledHandles)
      const pendingDefaultHandles = [...pendingLiveInputDefaultHandlesRef.current]
      pendingLiveInputDefaultHandlesRef.current.clear()
      defaultTerminalHandlesToLiveInput(pendingDefaultHandles)
    })
    return () => {
      disposed = true
    }
  }, [defaultTerminalHandlesToLiveInput, hostId, worktreeId])

  return {
    clearTerminalLiveInputDefault,
    defaultTerminalHandlesToLiveInput,
    liveInputTerminalHandles,
    liveInputTerminalHandlesRef,
    pruneTerminalHandlesFromLiveInput,
    toggleTerminalLiveInput
  }
}
