// 1. Variables globales de la page
let currentHero = null;
let heroesList = [];

// 2. Fonctions de chargement des données
async function loadHeroes() {
  try {
    const userId = localStorage.getItem('userId');
    heroesList = await api.get(`/api/heroes/${userId}/list`);
    displayHeroes(heroesList);
  } catch (error) {
    console.error('Erreur chargement héros:', error);
  }
}

// 3. Fonctions d'affichage
function displayHeroes(heroes) {
  const container = document.getElementById('heroes-container');
  
  if (heroes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>Aucun héros</h2>
        <button onclick="showCreateForm()">Créer un héros</button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = heroes.map(hero => `
    <div class="hero-card">
      <p>Niveau: ${hero.level}</p>
      <p>HP: ${hero.initial_stats.hp}</p>
      <p>Attaque: ${hero.initial_stats.att}</p>
      <p>Defense: ${hero.initial_stats.def}</p>
      <p>Regen: ${hero.initial_stats.regen}</p>
      <button onclick="selectHero('${hero.id}')">Jouer</button>
      <button onclick="deleteHero('${hero.id}')">Supprimer</button>
    </div>
  `).join('');
}

// 4. Actions utilisateur
async function selectHero(heroId) {
  localStorage.setItem('selectedHeroId', heroId);
  window.location.href = 'dungeon.html';
}

async function deleteHero(heroId) {
  if (!confirm('Supprimer ce héros ?')) return;
  
  try {
    await api.delete(`/api/heroes/${heroId}`);
    await loadHeroes();
  } catch (error) {
    alert('Erreur lors de la suppression');
  }
}

function showCreateForm() {
  // Afficher un formulaire de création
  // ... ton code ici
}

// 5. Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  // Cette fonction s'exécute quand le DOM est prêt
  loadHeroes();
});