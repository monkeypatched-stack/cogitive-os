import { create } from 'zustand'

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'

interface ConnectionState {
  wsStatus: ConnectionStatus
  lastMessage: unknown
  apiLive: boolean | null // null = not checked yet
  setWsStatus: (status: ConnectionStatus) => void
  setLastMessage: (message: unknown) => void
  setApiLive: (live: boolean) => void
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  wsStatus: 'connecting',
  lastMessage: null,
  apiLive: null,
  setWsStatus: (wsStatus) => set({ wsStatus }),
  setLastMessage: (lastMessage) => set({ lastMessage }),
  setApiLive: (apiLive) => set({ apiLive }),
}))
