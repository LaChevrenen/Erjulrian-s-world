import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/MainMenu.css';

interface Hero {
  id: string;
  name: string;
  level: number;
  experience?: number;
  health?: number;
  mana?: number;
  hero_id?: string;
  current_hp?: number;
  base_hp?: number;
  base_att?: number;
  base_def?: number;
  currentRun?: {
    _id: string;
    id?: string;
    heroId: string;
  };
}

interface CreateHeroForm {
  name: string;
}

export default function MainMenu(): React.ReactElement {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [formData, setFormData] = useState<CreateHeroForm>({ name: '' });
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      navigate('/', { replace: true });
      return;
    }
    setUserId(userId);
    loadHeroes(userId);
  }, []);

  const loadHeroes = async (userId: string): Promise<void> => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const heroesResponse = await fetch(`http://localhost:3000/api/heroes/${userId}/list`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (heroesResponse.ok) {
        const heroesData = await heroesResponse.json();
        
        const dungeonsResponse = await fetch('http://localhost:3000/api/dungeons', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        let dungeons: any[] = [];
        if (dungeonsResponse.ok) {
          dungeons = await dungeonsResponse.json();
        }
        
        const heroesWithRuns = (Array.isArray(heroesData) ? heroesData : []).map((hero: any) => {
          const heroId = hero.hero_id || hero.id;
          const currentRun = dungeons.find((run: any) => run.heroId === heroId && run.status === 'in_progress');
          const runId = currentRun?.runId || currentRun?._id || currentRun?.id;
          return {
            ...hero,
            currentRun: currentRun && runId ? { ...currentRun, runId, _id: runId, id: runId } : null
          };
        });
        
        setHeroes(heroesWithRuns);
      } else if (heroesResponse.status !== 404) {
        console.error('Erreur lors du chargement des héros', heroesResponse.status);
      }
    } catch (err) {
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = (): void => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    navigate('/', { replace: true });
  };

  const handlePlayHero = async (heroId: string, existingRunId?: string): Promise<void> => {
    try {
      const token = localStorage.getItem('token');
      
      if (existingRunId) {
        localStorage.setItem('selectedHeroId', heroId);
        localStorage.setItem('currentDungeonId', existingRunId);
        navigate('/dungeon/play');
        return;
      }
      
      const response = await fetch('http://localhost:3000/api/dungeons/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          heroId: heroId
        })
      });

      if (response.status === 409) {
        alert('Un donjon est déjà en cours pour ce héros. Rechargement...');
        await loadHeroes(userId!);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors du démarrage du donjon');
      }

      const dungeon = await response.json();
      
      localStorage.setItem('selectedHeroId', heroId);
      localStorage.setItem('currentDungeonId', dungeon.runId);
      
      navigate('/dungeon/play');
      
      await loadHeroes(userId!);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur';
      alert(errorMessage);
      console.error('Erreur:', errorMessage);
    }
  };

  const handleDeleteHero = async (heroId: string): Promise<void> => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`http://localhost:3000/api/heroes/${heroId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression');
      }

      await loadHeroes(userId!);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur';
      alert(errorMessage);
      console.error('Erreur:', errorMessage);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { value } = e.currentTarget;
    setFormData({ name: value });
    setError('');
  };

  const handleCreateHero = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Le nom du héros est requis');
      return;
    }

    if (loading) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const heroResponse = await fetch('http://localhost:3000/api/heroes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          userId: userId
        })
      });

      if (!heroResponse.ok) {
        const errorData = await heroResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de la création du héros');
      }

      const newHero = await heroResponse.json();
      const heroId = newHero.heroId || newHero.hero_id || newHero.id;

      const dungeonResponse = await fetch('http://localhost:3000/api/dungeons/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          heroId: heroId
        })
      });

      if (!dungeonResponse.ok) {
        const errorData = await dungeonResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de la création du donjon');
      }

      const dungeon = await dungeonResponse.json();
      
      if (!dungeon.runId) {
        throw new Error('Le donjon créé n\'a pas de runId');
      }
      
      localStorage.setItem('selectedHeroId', heroId);
      localStorage.setItem('currentDungeonId', dungeon.runId);
      
      navigate('/dungeon/play');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de la création';
      setError(errorMessage);
      console.error('Erreur:', errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="heroes-page">
      <div className="background-overlay"></div>

      <div className="heroes-header">
        <h1 className="page-title">🏰 Menu Principal</h1>
        <div className="header-actions">
          <button className="btn-logs" onClick={() => navigate('/logs')}>
            📊 Logs
          </button>
          <button className="btn-create" onClick={() => setShowModal(true)}>
            🎮 Nouvelle Aventure
          </button>
          <button className="btn-logout" onClick={handleLogout}>
            Déconnexion
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <p className="empty-state-text">Chargement du monde...</p>
        </div>
      ) : heroes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">⚔️</div>
          <p className="empty-state-text">Aucun héros dans votre monde...</p>
          <p className="empty-state-text">Créez votre premier héros pour commencer votre épopée!</p>
        </div>
      ) : (
        <div className="heroes-container">
          {heroes.map((hero, index) => {
            const heroId = hero.hero_id || hero.id;
            const heroName = hero.name || (heroId ? `Héros ${heroId.substring(0, 8)}` : 'Héros inconnu');
            const hasActiveRun = !!hero.currentRun;
            const runId = hero.currentRun?._id || hero.currentRun?.id;
            
            return (
              <div key={heroId || `hero-${index}`} className="hero-card">
                <div>
                  <h2 className="hero-name">⚔️ {heroName}</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
                  <div className="hero-stat">
                    <span className="hero-stat-label">Niveau</span>
                    <span className="hero-stat-value">{hero.level || 1}</span>
                  </div>
                  {(hero.current_hp !== undefined || hero.health !== undefined) && (
                    <div className="hero-stat">
                      <span className="hero-stat-label">Santé</span>
                      <span className="hero-stat-value">
                        {hero.current_hp || hero.health}/{hero.base_hp || hero.health}
                      </span>
                    </div>
                  )}
                  {hero.base_att !== undefined && (
                    <div className="hero-stat">
                      <span className="hero-stat-label">Attaque</span>
                      <span className="hero-stat-value">{hero.base_att}</span>
                    </div>
                  )}
                  {hero.base_def !== undefined && (
                    <div className="hero-stat">
                      <span className="hero-stat-label">Défense</span>
                      <span className="hero-stat-value">{hero.base_def}</span>
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    className="btn-submit"
                    style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                    onClick={() => heroId && handlePlayHero(heroId, runId)}
                    disabled={!heroId}
                  >
                    {hasActiveRun ? 'Continuer' : 'Jouer'}
                  </button>
                  <button
                    className="btn-delete-hero"
                    onClick={() => heroId && handleDeleteHero(heroId)}
                    disabled={!heroId}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">⚔️ Créer un Héros</h2>

            <form onSubmit={handleCreateHero}>
              <div className="form-group">
                <label htmlFor="heroName" className="form-label">
                  Nom du Héros
                </label>
                <input
                  id="heroName"
                  type="text"
                  className="form-input"
                  placeholder="Entrez le nom de votre héros..."
                  value={formData.name}
                  onChange={handleInputChange}
                  maxLength={50}
                  autoFocus
                />
                <p style={{
                  color: 'var(--gold-light)',
                  fontSize: '0.85rem',
                  marginTop: '8px',
                  fontStyle: 'italic'
                }}>
                  Un donjon sera automatiquement créé pour votre héros
                </p>
              </div>

              {error && (
                <div style={{
                  color: '#8b2323',
                  marginBottom: '15px',
                  padding: '10px',
                  backgroundColor: 'rgba(139, 35, 35, 0.2)',
                  borderRadius: '5px',
                  textAlign: 'center'
                }}>
                  ⚠️ {error}
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={loading}
                >
                  {loading ? '⏳ Création...' : '✨ Créer'}
                </button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setShowModal(false);
                    setError('');
                  }}
                  disabled={loading}
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
