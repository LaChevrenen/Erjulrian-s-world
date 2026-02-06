import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Inventory.css';

interface InventoryItem {
  id: string;
  artifactId: string;
  equipped: boolean;
  upgradeLevel: number;
  baseLevel?: number;
  name?: string;
  description?: string;
  hp_buff?: number;
  att_buff?: number;
  def_buff?: number;
  regen_buff?: number;
}

interface Inventory {
  gold: number;
  equippedCount: number;
  items: InventoryItem[];
}

interface UpgradeInfo {
  cost: number;
  currentLevel: number;
  maxLevel: number;
  canUpgrade: boolean;
}

export default function InventoryPage(): React.ReactElement {
  const navigate = useNavigate();
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [heroId, setHeroId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [levelSort, setLevelSort] = useState<'desc' | 'asc'>('desc');

  const getItemLevelLabel = (item: InventoryItem): string => {
    const base = Number.isFinite(item.baseLevel) ? Number(item.baseLevel) : 0;
    const upgrade = Number.isFinite(item.upgradeLevel) ? Number(item.upgradeLevel) : 0;
    return `Niveau ${base + upgrade}`;
  };

  const getItemLevelValue = (item: InventoryItem): number => {
    const base = Number.isFinite(item.baseLevel) ? Number(item.baseLevel) : 0;
    const upgrade = Number.isFinite(item.upgradeLevel) ? Number(item.upgradeLevel) : 0;
    return base + upgrade;
  };

  const getItemStats = (item: InventoryItem): Array<{ label: string; value: number }> => {
    const stats: Array<{ label: string; value: number }> = [];
    if (item.hp_buff) stats.push({ label: 'PV', value: item.hp_buff });
    if (item.att_buff) stats.push({ label: 'ATK', value: item.att_buff });
    if (item.def_buff) stats.push({ label: 'DEF', value: item.def_buff });
    if (item.regen_buff) stats.push({ label: 'REG', value: item.regen_buff });
    return stats;
  };

  useEffect(() => {
    const storedHeroId = localStorage.getItem('selectedHeroId');
    const token = localStorage.getItem('token');

    if (!token || !storedHeroId) {
      navigate('/menu', { replace: true });
      return;
    }

    setHeroId(storedHeroId);
    loadInventory(storedHeroId);
  }, []);

  const loadInventory = async (heroId: string): Promise<void> => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`http://localhost:3000/api/inventory/${heroId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setInventory(data);
      } else if (response.status === 404) {
        const createResponse = await fetch('/api/inventory', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            heroId: heroId,
            gold: 0
          })
        });

        if (createResponse.ok) {
          setInventory({ gold: 0, equippedCount: 0, items: [] });
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur';
      setError(errorMessage);
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEquip = async (item: InventoryItem): Promise<void> => {
    if (!inventory || !heroId) return;

    try {
      const token = localStorage.getItem('token');

      const updatedItems = inventory.items.map(i => 
        i.id === item.id ? { ...i, equipped: !i.equipped } : i
      );

      const response = await fetch(`http://localhost:3000/api/inventory/${heroId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          heroId: heroId,
          gold: inventory.gold,
          items: updatedItems
        })
      });

      if (!response.ok) {
        throw new Error('Impossible de modifier l\'équipement');
      }

      await loadInventory(heroId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur';
      alert(errorMessage);
    }
  };

  const handleUpgradeItem = async (item: InventoryItem): Promise<void> => {
    if (!heroId) return;

    try {
      const token = localStorage.getItem('token');

      const infoResponse = await fetch(`http://localhost:3000/api/inventory/${heroId}/upgrade-info/${item.artifactId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!infoResponse.ok) {
        throw new Error('Impossible d\'obtenir les informations d\'amélioration');
      }

      const upgradeInfo: UpgradeInfo = await infoResponse.json();

      if (!upgradeInfo.canUpgrade) {
        alert('Amélioration impossible : niveau max atteint ou or insuffisant');
        return;
      }

      if (!confirm(`Améliorer cet objet pour ${upgradeInfo.cost} or ?`)) {
        return;
      }

      const response = await fetch(`http://localhost:3000/api/inventory/${heroId}/upgrade/${item.artifactId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Impossible d\'améliorer l\'objet');
      }

      alert('Objet amélioré avec succès ! ✨');
      await loadInventory(heroId);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur';
      alert(errorMessage);
    }
  };

  const handleBackToMenu = (): void => {
    navigate('/menu');
  };

  if (loading) {
    return (
      <div className="inventory-page">
        <div className="background-overlay"></div>
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <p className="empty-state-text">Chargement de l'inventaire...</p>
        </div>
      </div>
    );
  }

  if (error || !inventory) {
    return (
      <div className="inventory-page">
        <div className="background-overlay"></div>
        <div className="empty-state">
          <div className="empty-state-icon">⚠️</div>
          <p className="empty-state-text">{error || 'Inventaire introuvable'}</p>
          <button className="btn-submit" onClick={handleBackToMenu}>
            Retour aux Héros
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <div className="background-overlay"></div>

      <div className="inventory-header">
        <button className="btn-back" onClick={handleBackToMenu}>
          ← Retour
        </button>
        <h1 className="page-title">🎒 Inventaire</h1>
        <div className="gold-display">
          💰 {inventory.gold} Or
        </div>
      </div>

      <div className="equipped-panel">
        <h3 className="equipped-title">Équipés: {inventory.equippedCount}</h3>
        <div className="inventory-sort">
          <label className="inventory-sort-label" htmlFor="inventory-level-sort">Trier par niveau</label>
          <select
            id="inventory-level-sort"
            className="inventory-sort-select"
            value={levelSort}
            onChange={(e) => setLevelSort(e.target.value as 'desc' | 'asc')}
          >
            <option value="desc">Du plus haut au plus bas</option>
            <option value="asc">Du plus bas au plus haut</option>
          </select>
        </div>
      </div>

      {inventory.items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <p className="empty-state-text">Votre inventaire est vide</p>
          <p className="empty-state-text">Explorez les donjons pour trouver des objets !</p>
        </div>
      ) : (
        <div className="items-container">
          {[...inventory.items]
            .sort((a, b) => {
              const diff = getItemLevelValue(b) - getItemLevelValue(a);
              return levelSort === 'desc' ? diff : -diff;
            })
            .map((item) => (
            <div
              key={item.id}
              className={`item-card ${item.equipped ? 'equipped' : ''}`}
            >
              {item.equipped && (
                <div className="equipped-badge">✓ Équipé</div>
              )}
              
              <div className="item-icon">
                {item.equipped ? '⚔️' : '🗡️'}
              </div>

              <h3 className="item-name">
                {item.name || `Artefact ${item.artifactId.substring(0, 8)}`}
              </h3>

              {item.description && (
                <p className="item-description">{item.description}</p>
              )}

              <div className="item-level">
                {getItemLevelLabel(item)}
              </div>

              {getItemStats(item).length > 0 && (
                <div className="item-stats">
                  {getItemStats(item).map((stat) => (
                    <div key={stat.label} className="stat-line">
                      {stat.label} +{stat.value}
                    </div>
                  ))}
                </div>
              )}

              <div className="item-actions">
                <button
                  className={`btn-equip ${item.equipped ? 'equipped' : ''}`}
                  onClick={() => handleToggleEquip(item)}
                >
                  {item.equipped ? '📤 Déséquiper' : '📥 Équiper'}
                </button>
                <button
                  className="btn-upgrade"
                  onClick={() => handleUpgradeItem(item)}
                >
                  ⬆️ Améliorer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
