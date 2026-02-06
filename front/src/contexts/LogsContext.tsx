import React, { createContext, useContext, useState, useCallback } from 'react';

export interface GameLog {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'action';
  timestamp: Date;
  duration?: number;
}

interface LogsContextType {
  logs: GameLog[];
  addLog: (message: string, type?: GameLog['type'], duration?: number) => void;
  clearLogs: () => void;
  removeLogs: (ids: string[]) => void;
}

const LogsContext = createContext<LogsContextType | undefined>(undefined);

export const LogsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<GameLog[]>([]);

  const addLog = useCallback((
    message: string,
    type: GameLog['type'] = 'info',
    duration?: number
  ) => {
    const id = `${Date.now()}-${Math.random()}`;
    const log: GameLog = {
      id,
      message,
      type,
      timestamp: new Date(),
      duration
    };

    setLogs(prev => [log, ...prev].slice(0, 100));

    if (duration) {
      setTimeout(() => {
        removeLogs([id]);
      }, duration);
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const removeLogs = useCallback((ids: string[]) => {
    setLogs(prev => prev.filter(log => !ids.includes(log.id)));
  }, []);

  return (
    <LogsContext.Provider value={{ logs, addLog, clearLogs, removeLogs }}>
      {children}
    </LogsContext.Provider>
  );
};

export const useLogs = (): LogsContextType => {
  const context = useContext(LogsContext);
  if (!context) {
    throw new Error('useLogs must be used within a LogsProvider');
  }
  return context;
};
