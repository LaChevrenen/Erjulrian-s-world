import React, { useEffect, useState } from 'react';
import '../styles/LogsViewer.css';

interface LogEntry {
  id: string;
  user_id: string | null;
  level: number;
  timestamp: string;
  service: string;
  event_type: string;
  payload: any;
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';
const POLLING_INTERVAL = 1000;
const LOGS_LIMIT = 500;

export default function LogsViewer(): React.ReactElement {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const response = await fetch(`${API_BASE}/api/logs?limit=${LOGS_LIMIT}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setLogs(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Erreur chargement logs:', error);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, POLLING_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const getLevelBadge = (level: number): string => {
    if (level >= 3) return '🔴';
    if (level === 2) return '🟡';
    return '🟢';
  };

  const getServiceColor = (service: string): string => {
    const colors: Record<string, string> = {
      'dungeon': '#E53935',
      'hero': '#1E88E5',
      'inventory': '#8E24AA',
      'combat': '#FB8C00',
      'log': '#43A047',
      'user': '#3949AB'
    };
    return colors[service] || '#999';
  };

  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit'
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="logs-viewer">
      <div className="logs-header">
        <h2>📊 Monitoring EN DIRECT</h2>
        <span className="live-indicator">● EN DIRECT</span>
      </div>

      {logs.length === 0 ? (
        <div className="logs-empty">
          <p>Aucun log pour l'instant...</p>
          <p style={{fontSize: '0.9rem', opacity: 0.7}}>Commencez une partie pour générer des logs</p>
        </div>
      ) : (
        <div className="logs-list">
          {logs.map((log) => (
            <div
              key={log.id}
              className="log-entry"
              style={{ borderLeft: `4px solid ${getServiceColor(log.service)}` }}
            >
              <div className="log-time">{formatTimestamp(log.timestamp)}</div>
              <div className="log-level">{getLevelBadge(log.level)}</div>
              <div 
                className="log-service" 
                style={{ backgroundColor: getServiceColor(log.service) }}
              >
                {String(log.service || 'unknown').toUpperCase()}
              </div>
              <div className="log-event">{log.event_type}</div>
              <div className="log-payload">
                {typeof log.payload === 'object' 
                  ? JSON.stringify(log.payload).substring(0, 200)
                  : String(log.payload).substring(0, 200)
                }
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="logs-footer">
        <span>{logs.length} logs en direct</span>
      </div>
    </div>
  );
}
