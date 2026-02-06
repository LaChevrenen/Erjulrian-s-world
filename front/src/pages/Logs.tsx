import React from 'react';
import { useNavigate } from 'react-router-dom';
import LogsViewer from '../components/LogsViewer';
import '../styles/Logs.css';

export default function Logs(): React.ReactElement {
  const navigate = useNavigate();
  const handleBackToMenu = (): void => {
    navigate('/menu');
  };

  return (
    <div className="logs-page">
      <div className="logs-header-bar">
        <button className="btn-back" onClick={handleBackToMenu}>
          ← Retour au Menu
        </button>
        <h1 className="page-title">📊 Monitoring des Services</h1>
        <div className="header-spacer"></div>
      </div>

      <div className="logs-container">
        <LogsViewer />
      </div>
    </div>
  );
}
