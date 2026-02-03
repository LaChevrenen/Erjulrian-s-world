
let createButton = null;
let currentHero = null;
let heroesList = [];

document.addEventListener('DOMContentLoaded', function() {
  createButton = document.getElementById("createHeroBtn");
  
  if (!createButton) {
    return;
  }
  
  loadHeroes();
});

async function loadHeroes() {
  try {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      console.error("Pas de userId");
      return;
    }
    // Get heroes
    heroesList = await api.get(`/api/heroes/${userId}/list`);

    // Get runs to associate with heroes (if any)
    const runs = await api.get(`/api/dungeons`);
    // Add current run to heroes
    heroesList.map((h) => {
      const currentRun = runs.find((r) => r.heroId === h.hero_id);
      h.currentRun = currentRun ?? null;
      console.log(JSON.stringify(h));
    });

    
    displayHeroes(heroesList);
    
    
    if (createButton) {
      createButton.disabled = heroesList.length >= 5;
      console.log(`Bouton ${createButton.disabled ? 'désactivé' : 'activé'} (5/${heroesList.length})`);
    }
    
  } catch (error) {
    console.error('Erreur chargement héros:', error);
  }
}

function displayHeroes(heroes) {
  const container = document.getElementById('heroes-container');
  
  if (!container) {
    console.error("Container heroes-container introuvable");
    return;
  }
  
  if (heroes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>Aucun héros</h2>
      </div>
    `;
    return;
  }
  
  container.innerHTML = heroes.map((hero) => {
    if(hero.currentRun?._id) {
      return `
      <div class="hero-card" 
      data-hero-id="${hero.hero_id}"
      data-current-run-id="${hero.currentRun?._id || ''}">
        <p>ID: ${hero.hero_id}</p>
        <p>Niveau: ${hero.level}</p>
        <p>HP: ${hero.current_hp}/${hero.base_hp}</p>
        <p>Attaque: ${hero.base_att} | Défense: ${hero.base_def}</p>
        <input id="currentRunId" type="hidden" value="${hero.currentRun?.id || ''}">
        <button onclick="selectHero('${hero.hero_id}')">Continuer la partie</button>
        <button onclick="deleteHero('${hero.hero_id}')">Supprimer</button>
      </div>
    `
    } else {
        return `
      <div class="hero-card" 
      data-hero-id="${hero.hero_id}"
      data-current-run-id="${hero.currentRun?._id || ''}">
        <p>ID: ${hero.hero_id}</p>
        <p>Niveau: ${hero.level}</p>
        <p>HP: ${hero.current_hp}/${hero.base_hp}</p>
        <p>Attaque: ${hero.base_att} | Défense: ${hero.base_def}</p>
        <input id="currentRunId" type="hidden" value="${hero.currentRun?.id || ''}">
        <button onclick="selectHero('${hero.hero_id}')">Jouer</button>
        <button onclick="deleteHero('${hero.hero_id}')">Supprimer</button>
      </div>
    `
    }
  } ).join('');
}

async function createHero() {
  if (!createButton || createButton.disabled) {
    console.log("Création bloquée (limite atteinte)");
    return;
  }
  
  const userId = localStorage.getItem('userId');
  try {
    await api.post(`/api/heroes`, { userId });
    await loadHeroes(); // Recharge et met à jour le bouton
  } catch (error) {
    console.error("Erreur création:", error);
  }
}

async function selectHero(heroId) {
  localStorage.setItem('selectedHeroId', heroId);
  const newDungeon = await api.post('/api/dungeons/start', {heroId: heroId});
  console.log(JSON.stringify(newDungeon));
  //window.location.href = 'dungeon.html';
}

async function deleteHero(heroId) {
  if (!confirm('Supprimer ce héros ?')) return;
  try {
    const card = event.target.closest('.hero-card');
    const currentRunId = card.dataset.currentRunId;
    console.log(currentRunId);
    if(currentRunId) {
      console.log(currentRunId);
      await api.delete(`/api/dungeons/${currentRunId}`);
    }
    // const runs = await api.get(`/api/dungeons`);
    // const run = runs.find(r => r.userId === heroId);
    // console.log(run._id);
    // if(run) {
    // }
    
    await api.delete(`/api/heroes/${heroId}`);
    await loadHeroes();
  } catch (error) {
    alert('Erreur suppression');
  }
}
