import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LogsProvider } from './contexts/LogsContext';
import Login from './components/Login';
import MainMenu from './pages/MainMenu';
import DungeonPlay from './pages/DungeonPlay';
import Inventory from './pages/Inventory';
import Logs from './pages/Logs';

export default function App(): React.ReactElement {
  return (
    <LogsProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/menu" element={<MainMenu />} />
          <Route path="/dungeon/play" element={<DungeonPlay />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </LogsProvider>
  );
}
