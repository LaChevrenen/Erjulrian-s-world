import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/DungeonPlay.css';
import { useLogs } from '../contexts/LogsContext';

interface RoomChoice {
  floor: number;
  room: number;
  choiceNumber: number;
  type: string;
  monsterId?: string | null;
  monster?: {
    id: string;
    name: string;
    type: string;
    description?: string | null;
    stats?: {
      hp: number;
      att: number;
      def: number;
      regen: number;
    };
  } | null;
}

interface HeroStats {
  hero_id: string;
  user_id: string;
  level: number;
  xp: number;
  base_hp: number;
  current_hp: number;
  base_att: number;
  base_def: number;
  base_regen: number;
}

interface Inventory {
  gold: number;
  equippedCount: number;
  items: Array<{
    id: string;
    artifactId: string;
    equipped: boolean;
    upgradeLevel: number;
    name?: string;
    hp_buff?: number;
    att_buff?: number;
    def_buff?: number;
    regen_buff?: number;
  }>;
}

interface UpgradeInfo {
  artifactId: string;
  name: string;
  currentLevel: number;
  nextLevel: number;
  maxLevel: number;
  baseLevel: number;
  nextUpgradeCost: number;
  currentGold: number;
  canUpgrade: boolean;
  reason?: string | null;
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';
const INVENTORY_API_BASE = import.meta.env.VITE_INVENTORY_BASE || 'http://localhost:3000';

export default function DungeonPlay(): React.ReactElement {
  const navigate = useNavigate();
  const { addLog } = useLogs();
  const [choices, setChoices] = useState<RoomChoice[]>([]);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [heroStats, setHeroStats] = useState<HeroStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [heroMissing, setHeroMissing] = useState<boolean>(false);
  const [upgradingItems, setUpgradingItems] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [victory, setVictory] = useState<boolean>(false);
  const isGameOver = heroMissing || (heroStats ? heroStats.current_hp <= 0 : false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const dungeonId = localStorage.getItem('currentDungeonId');
    const heroId = localStorage.getItem('selectedHeroId');

    if (!token || !dungeonId || !heroId) {
      navigate('/menu', { replace: true });
      return;
    }

    loadGameState(dungeonId, heroId);
  }, []);

  const loadGameState = async (dungeonId: string, heroId: string): Promise<void> => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const heroResponse = await fetch(`${API_BASE}/api/heroes/${heroId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (heroResponse.status === 404) {
        setHeroStats(null);
        setHeroMissing(true);
            setChoices([]);
        setInventory(null);
        setLoading(false);
        return;
      }
      if (!heroResponse.ok) {
        setError('Erreur lors du chargement du héros');
        setLoading(false);
        return;
      }
      const heroData = await heroResponse.json();
      setHeroStats(heroData);
      setHeroMissing(false);
      if (heroData.current_hp <= 0) {
        setChoices([]);
        setHeroMissing(true);
        setInventory(null);
        setLoading(false);
        return;
      }

      const choicesResponse = await fetch(`${API_BASE}/api/dungeons/${dungeonId}/choices`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (choicesResponse.status === 404) {
        setChoices([]);
        setHeroMissing(true);
        setHeroStats(prev => (prev ? { ...prev, current_hp: 0 } : prev));
        setInventory(null);
        setLoading(false);
        return;
      }
      if (!choicesResponse.ok) {
        setError('Erreur lors du chargement du donjon');
        setLoading(false);
        return;
      }
      const data = await choicesResponse.json();
      setChoices(data.choices || []);

      let inventoryResponse = await fetch(`${INVENTORY_API_BASE}/api/inventory/${heroId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (inventoryResponse.status === 404) {
        const createResponse = await fetch(`${INVENTORY_API_BASE}/api/inventory`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ heroId, gold: 0 })
        });
        if (createResponse.ok) {
          setInventory({ gold: 0, equippedCount: 0, items: [] });
        } else {
          setInventory(null);
        }
        setLoading(false);
        return;
      }
      if (!inventoryResponse.ok) {
        setError('Erreur lors du chargement de l\'inventaire');
        setLoading(false);
        return;
      }
      const inventoryData = await inventoryResponse.json();
      setInventory(inventoryData);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement';
      setError(errorMessage);
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChooseRoom = async (choiceIndex: number): Promise<void> => {
    if (isProcessing || loading) {
      return;
    }

    if (isGameOver || heroMissing || !heroStats) {
      setError('Stats du héros non chargées');
      return;
    }

    try {
      setIsProcessing(true);
      const token = localStorage.getItem('token');
      const dungeonId = localStorage.getItem('currentDungeonId');
      const heroId = localStorage.getItem('selectedHeroId');
      
      const choice = choices[choiceIndex];
      if (!choice) {
        setError('Choix de salle invalide');
        return;
      }

      const equippedItems = inventory?.items.filter(item => item.equipped) || [];
      const totalStats = {
        hp: heroStats.base_hp + equippedItems.reduce((sum, item) => sum + (item.hp_buff || 0), 0),
        current_hp: heroStats.current_hp,
        att: heroStats.base_att + equippedItems.reduce((sum, item) => sum + (item.att_buff || 0), 0),
        def: heroStats.base_def + equippedItems.reduce((sum, item) => sum + (item.def_buff || 0), 0),
        regen: heroStats.base_regen + equippedItems.reduce((sum, item) => sum + (item.regen_buff || 0), 0)
      };

      const response = await fetch(`${API_BASE}/api/dungeons/${dungeonId}/choose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          choiceIndex: choiceIndex,
          heroStats: totalStats
        })
      });

      if (!response.ok) {
        throw new Error('Impossible de choisir cette salle');
      }

      const roomLabel = getRoomLabel(choice.type);
      addLog(`${roomLabel} sélectionnée (Étage ${choice.floor}, Salle ${choice.room})`, 'action', 2000);

      if (choice.type.toLowerCase() === 'boss') {
        const result = await response.json();
        if (result && result.result === 'win') {
          setVictory(true);
        }
      }

      await loadGameState(dungeonId!, heroId!);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur';
      alert(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBackToRuns = (): void => {
    navigate('/menu');
  };

  const handleGameOverReturn = async (): Promise<void> => {
    const dungeonId = localStorage.getItem('currentDungeonId');
    const heroId = localStorage.getItem('selectedHeroId');
    const token = localStorage.getItem('token');

    if (dungeonId && token) {
      try {
        await fetch(`${API_BASE}/api/dungeons/${dungeonId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (error) {
        console.error('Erreur lors de la suppression du donjon:', error);
      }
    }

    if (heroId && token) {
      try {
        await fetch(`${API_BASE}/api/heroes/${heroId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (error) {
        console.error('Erreur lors de la suppression du héros:', error);
      }
      // Suppression de l'inventaire du héros
      try {
        await fetch(`${INVENTORY_API_BASE}/api/inventory/${heroId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (error) {
        console.error('Erreur lors de la suppression de l\'inventaire:', error);
      }
    }

    localStorage.removeItem('currentDungeonId');
    localStorage.removeItem('selectedHeroId');
    navigate('/menu');
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, itemId: string): void => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('itemId', itemId);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnSlot = async (e: React.DragEvent<HTMLDivElement>, slotIndex: number): Promise<void> => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('itemId');
    const token = localStorage.getItem('token');
    const heroId = localStorage.getItem('selectedHeroId');

    if (!itemId || !token || !heroId || !inventory) return;

    const item = inventory.items.find(i => i.id === itemId);
    if (!item) return;

    try {
      const response = await fetch(`${INVENTORY_API_BASE}/api/inventory/${itemId}/equip`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ equipped: !item.equipped })
      });

      if (response.ok) {
        const updatedItem = await response.json();
        const updatedItems = inventory.items.map(i => 
          i.id === itemId ? { ...i, equipped: updatedItem.equipped } : i
        );
        setInventory({ ...inventory, items: updatedItems });
        if (updatedItem.equipped) {
          addLog(`${getArtifactName(item)} équipé!`, 'action', 2500);
        } else {
          addLog(`${getArtifactName(item)} rangé`, 'action', 2500);
        }
      } else {
        const errorText = await response.text();
        console.error('Equip failed:', response.status, errorText);
        addLog(`❌ Erreur d'équipement`, 'error', 2500);
      }
    } catch (err) {
      console.error('Erreur lors de l\'équipement:', err);
    }
  };

  const handleDropOnBackpack = async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('itemId');
    const token = localStorage.getItem('token');

    if (!itemId || !token || !inventory) return;

    const item = inventory.items.find(i => i.id === itemId);
    if (!item || !item.equipped) return;

    try {
      const response = await fetch(`${INVENTORY_API_BASE}/api/inventory/${itemId}/equip`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ equipped: false })
      });

      if (response.ok) {
        const updatedItem = await response.json();
        const updatedItems = inventory.items.map(i => 
          i.id === itemId ? { ...i, equipped: updatedItem.equipped } : i
        );
        setInventory({ ...inventory, items: updatedItems });
      }
    } catch (err) {
      console.error('Erreur lors du déséquipement:', err);
    }
  };

  const getArtifactName = (item: Inventory['items'][number]): string => {
    if (item.name && item.name.trim().length > 0) {
      return item.name.trim();
    }
    return `Artefact ${item.artifactId.substring(0, 6).toUpperCase()}`;
  };

  const getArtifactBuffs = (item: Inventory['items'][number]): string => {
    const parts: string[] = [];

    if (item.hp_buff) parts.push(`❤️ +${item.hp_buff} PV`);
    if (item.att_buff) parts.push(`⚔️ +${item.att_buff} ATK`);
    if (item.def_buff) parts.push(`🛡️ +${item.def_buff} DEF`);
    if (item.regen_buff) parts.push(`💚 +${item.regen_buff} REG`);

    return parts.join(' · ');
  };

  const getUpgradeCost = (item: Inventory['items'][number]): number => {
    return 25 * (item.upgradeLevel + 1);
  };

  const canUpgradeItem = (item: Inventory['items'][number]): boolean => {
    if (!inventory) return false;
    const cost = getUpgradeCost(item);
    const isMaxLevel = item.upgradeLevel >= 10;
    return !isMaxLevel && inventory.gold >= cost;
  };

  const handleUpgradeItem = async (item: Inventory['items'][number]): Promise<void> => {

    const heroId = localStorage.getItem('selectedHeroId');
    const token = localStorage.getItem('token');
    if (!inventory || !heroId || !token) {
      alert('Inventaire ou héros introuvable.');
      return;
    }
    if (!inventory.items.some(i => i.artifactId === item.artifactId)) {
      alert('Cet objet n’est pas présent dans votre inventaire. Impossible de l’améliorer.');
      return;
    }

    if (!canUpgradeItem(item)) {
      const cost = getUpgradeCost(item);
      const isMaxLevel = item.upgradeLevel >= 10;
      if (isMaxLevel) {
        alert('Cet objet a atteint le niveau maximum !');
      } else if (inventory && inventory.gold < cost) {
        alert(`Or insuffisant ! Vous avez ${inventory.gold} or mais l'amélioration coûte ${cost} or.`);
      }
      return;
    }

    try {
      const infoResponse = await fetch(`${INVENTORY_API_BASE}/api/inventory/${heroId}/upgrade-info/${item.artifactId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (infoResponse.status === 404) {
        alert('Impossible d\'améliorer cet objet : il n’est pas présent dans votre inventaire ou n’existe pas.');
        return;
      }
      if (!infoResponse.ok) {
        alert('Impossible d\'obtenir les informations d\'amélioration');
        return;
      }

      const upgradeInfo: UpgradeInfo = await infoResponse.json();

      if (!upgradeInfo.canUpgrade) {
        alert(`Amélioration impossible : ${upgradeInfo.reason || 'niveau max ou or insuffisant'}`);
        return;
      }

      setUpgradingItems(prev => new Set(prev).add(item.id));

      const response = await fetch(`${INVENTORY_API_BASE}/api/inventory/${heroId}/upgrade/${item.artifactId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || 'Impossible d\'améliorer l\'objet';
        addLog(`❌ Amélioration échouée: ${errorMsg}`, 'error', 3000);
        alert(errorMsg);
        return;
      }

      addLog(`${getArtifactName(item)} amélioré au niveau ${upgradeInfo.nextLevel}! (-${upgradeInfo.nextUpgradeCost} or)`, 'success', 4000);

      const inventoryResponse = await fetch(`${INVENTORY_API_BASE}/api/inventory/${heroId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (inventoryResponse.ok) {
        const inventoryData = await inventoryResponse.json();
        setInventory(inventoryData);
      }

      setTimeout(() => {
        setUpgradingItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(item.id);
          return newSet;
        });
      }, 600);
    } catch (err) {
      console.error('Error upgrading item:', err);
      alert('Erreur lors de l\'amélioration');
      setUpgradingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(item.id);
        return newSet;
      });
    }
  };

  const handleUnequipItem = async (item: Inventory['items'][number]): Promise<void> => {
    const token = localStorage.getItem('token');

    if (!token) return;

    try {
      const response = await fetch(`${INVENTORY_API_BASE}/api/inventory/${item.id}/equip`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ equipped: false })
      });

      if (response.ok) {
        const updatedItem = await response.json();
        const updatedItems = inventory?.items.map(i => 
          i.id === item.id ? updatedItem : i
        ) || [];
        setInventory({ ...inventory!, items: updatedItems });
        addLog(`${getArtifactName(item)} déséquipé`, 'action', 2500);
      } else {
        const errorText = await response.text();
        console.error('Unequip failed:', response.status, errorText);
        addLog(`❌ Erreur de déséquipement`, 'error', 2500);
      }
    } catch (err) {
      console.error('Error unequipping item:', err);
      addLog(`❌ Erreur lors du déséquipement`, 'error', 2500);
    }
  };

  const getRoomIcon = (type: string): string => {
    switch (type.toLowerCase()) {
      case 'combat':
      case 'monster':
        return '⚔️';
      case 'elite-combat':
        return '🗡️';
      case 'treasure':
      case 'loot':
        return '💰';
      case 'rest':
      case 'heal':
        return '🛌';
      case 'boss':
        return '👹';
      case 'exit':
        return '🚪';
      default:
        return '❓';
    }
  };

  const getRoomLabel = (type: string): string => {
    switch (type.toLowerCase()) {
      case 'combat':
        return 'Combat';
      case 'elite-combat':
        return 'Combat élite';
      case 'rest':
        return 'Repos';
      case 'boss':
        return 'Boss';
      default:
        return type;
    }
  };

  if (loading && choices.length === 0) {
    return (
      <div className="dungeon-play-page">
        <div className="background-overlay"></div>
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <p className="empty-state-text">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dungeon-play-page">
        <div className="background-overlay"></div>
        <div className="empty-state">
          <div className="empty-state-icon">⚠️</div>
          <p className="empty-state-text">{error}</p>
          <button className="btn-submit" onClick={handleBackToRuns}>
            Retour
          </button>
        </div>
      </div>
    );
  }

  if (victory) {
    return (
      <div className="dungeon-play-page">
        <div className="background-overlay"></div>
        <div className="game-over-overlay">
          <div className="game-over-panel victory">
            <h2 className="game-over-title">🏆 VICTOIRE</h2>
            <p className="game-over-text">Vous avez vaincu le boss et terminé le donjon !</p>
            <button className="btn-submit" onClick={handleBackToRuns}>
              Retour au Menu
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="dungeon-play-page">
      <div className="background-overlay"></div>

      {isGameOver && (
        <div className="game-over-overlay">
          <div className="game-over-panel">
            <h2 className="game-over-title">☠️ Game Over</h2>
            <p className="game-over-text">Votre héros est tombé au combat.</p>
            <button className="btn-submit" onClick={handleGameOverReturn}>
              Retour au Menu
            </button>
          </div>
        </div>
      )}

      <div className="dungeon-header">
        <button className="btn-back" onClick={handleBackToRuns}>
          ← Retour
        </button>
        <h1 className="page-title">🏰 Exploration</h1>
        <div className="header-spacer"></div>
      </div>

      <div className="dungeon-main">
        {heroStats && (
          <aside className="stats-sidebar">
            <div className="hero-stats-section variant-scroll">
              <h2 className="stats-title">⚔️ Statistiques du Héros</h2>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon">🎯</div>
                  <div className="stat-info">
                    <span className="stat-label">Niveau</span>
                    <span className="stat-value">{heroStats.level}</span>
                  </div>
                </div>
                <div className="stat-card hp">
                  <div className="stat-icon">❤️</div>
                  <div className="stat-info">
                    <span className="stat-label">Vie</span>
                    <span className="stat-value">
                      {heroStats.current_hp} / {heroStats.base_hp + (inventory?.items.filter(i => i.equipped).reduce((sum, i) => sum + (i.hp_buff || 0), 0) || 0)}
                    </span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">⚔️</div>
                  <div className="stat-info">
                    <span className="stat-label">Attaque</span>
                    <span className="stat-value">
                      {heroStats.base_att + (inventory?.items.filter(i => i.equipped).reduce((sum, i) => sum + (i.att_buff || 0), 0) || 0)}
                    </span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">🛡️</div>
                  <div className="stat-info">
                    <span className="stat-label">Défense</span>
                    <span className="stat-value">
                      {heroStats.base_def + (inventory?.items.filter(i => i.equipped).reduce((sum, i) => sum + (i.def_buff || 0), 0) || 0)}
                    </span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">💚</div>
                  <div className="stat-info">
                    <span className="stat-label">Régén.</span>
                    <span className="stat-value">
                      {heroStats.base_regen + (inventory?.items.filter(i => i.equipped).reduce((sum, i) => sum + (i.regen_buff || 0), 0) || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}

        <div className="choices-section variant-runic">
          <h2 className="section-title">🗺️ Choisissez une Salle</h2>
          {isGameOver ? (
            <div className="empty-choices">
              <p>Votre héros est tombé. Aucun choix disponible.</p>
              <button className="btn-submit" onClick={handleGameOverReturn}>
                Retour au Menu
              </button>
            </div>
          ) : choices.length === 0 ? (
            <div className="empty-choices">
              <p>Aucune salle disponible. Le donjon est peut-être terminé.</p>
              <button className="btn-submit" onClick={handleBackToRuns}>
                Retour aux Runs
              </button>
            </div>
          ) : (
            <div className="choices-grid">
              {choices.map((choice, index) => (
                <div key={index} className="choice-card">
                  <div className="choice-icon">
                    {getRoomIcon(choice.type)}
                  </div>
                  <div className="choice-info">
                    <h3 className="choice-type">{getRoomLabel(choice.type)}</h3>
                    <p className="choice-location">
                      Étage {choice.floor} - Salle {choice.room}
                    </p>
                    {choice.monster && (
                      <div className="choice-monster">
                        <div className="choice-monster-name">👾 {choice.monster.name}</div>
                        {choice.monster.description && (
                          <div className="choice-monster-desc">{choice.monster.description}</div>
                        )}
                        {choice.monster.stats && (
                          <div className="choice-monster-stats">
                            <span>❤️ {choice.monster.stats.hp}</span>
                            <span>⚔️ {choice.monster.stats.att}</span>
                            <span>🛡️ {choice.monster.stats.def}</span>
                            <span>💚 {choice.monster.stats.regen}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn-choose"
                    onClick={() => handleChooseRoom(index)}
                    disabled={loading || isProcessing || isGameOver}
                  >
                    {isProcessing ? '⏳ Chargement...' : loading ? '⏳' : 'Explorer'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="inventory-section variant-vault">
        <div className="inventory-layout">
          <div className="backpack-container">
            <div className="backpack-header">
              <span className="backpack-icon">🎒</span>
              <h3 className="backpack-title">Sac à Dos</h3>
            </div>
            <div className="backpack-gold">
              <span className="gold-icon">💰</span>
              <span className="gold-amount">{inventory?.gold || 0}</span>
            </div>
            <div className="backpack-items"
              onDragOver={handleDragOver}
              onDrop={handleDropOnBackpack}
            >
              {inventory && inventory.items.length > 0 ? (
                inventory.items.map((item) => (
                  <div 
                    key={item.id} 
                    className={`backpack-item ${item.equipped ? 'equipped' : ''} ${upgradingItems.has(item.id) ? 'upgrading' : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item.id)}
                  >
                    <div className="backpack-item-icon">⚔️</div>
                    <div className="backpack-item-info">
                      <span className="backpack-item-name">
                        {getArtifactName(item)}
                      </span>
                      <span className="backpack-item-level">Niveau {item.upgradeLevel}</span>
                      {getArtifactBuffs(item) && (
                        <span className="backpack-item-buffs">{getArtifactBuffs(item)}</span>
                      )}
                    </div>
                    <button 
                      className="upgrade-btn"
                      disabled={!canUpgradeItem(item)}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpgradeItem(item);
                      }}
                      title={`Améliorer pour ${getUpgradeCost(item)} or`}
                    >
                      ⬆️ 💰{getUpgradeCost(item)}
                    </button>
                    {item.equipped && <span className="equipped-badge">✓</span>}
                  </div>
                ))
              ) : (
                <div className="backpack-empty">
                  <p>Sac vide</p>
                </div>
              )}
            </div>
          </div>

          <div className="equipment-slots">
            <h3 className="equipment-title">⚔️ Équipement</h3>
            <div className="slots-grid">
              {[0, 1, 2, 3].map((slotIndex) => {
                const equippedItems = inventory?.items.filter(item => item.equipped) || [];
                const item = equippedItems[slotIndex];
                
                return (
                  <div 
                    key={slotIndex} 
                    className={`equipment-slot ${item ? 'filled' : 'empty'} ${item && upgradingItems.has(item.id) ? 'upgrading' : ''}`}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnSlot(e, slotIndex)}
                  >
                    {item ? (
                      <>
                        <button 
                          className="slot-unequip-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnequipItem(item);
                          }}
                          title="Déséquipper"
                        >
                          ❌
                        </button>
                        <div className="slot-icon">⚔️</div>
                        <div className="slot-name"
                          draggable
                          onDragStart={(e) => handleDragStart(e, item.id)}
                        >
                          {getArtifactName(item)}
                        </div>
                        <div className="slot-level">Niveau {item.upgradeLevel}</div>
                        {getArtifactBuffs(item) && (
                          <div className="slot-buffs">
                            {getArtifactBuffs(item).split(' · ').join('\n')}
                          </div>
                        )}
                        <button 
                          className="slot-upgrade-btn"
                          disabled={!canUpgradeItem(item)}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpgradeItem(item);
                          }}
                          title={`Améliorer pour ${getUpgradeCost(item)} or`}
                        >
                          💰{getUpgradeCost(item)}
                        </button>
                      </>
                    ) : (
                      <div className="slot-empty-text">Vide</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
