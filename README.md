# Erjulrian's world

## Hero's stats
- PV :
- DEF : 
- ATT :
- REGEN :

## Donjon rules
3 floor of 5 rooms. After each rooms you have 2 choices for the next rooms.
There is x different rooms (combat, elite-combat, bonus, debuff, boss).
Dungeon can change your base states during the dungeons and you can find artefact to boost temporally stats.

## Services
- API Gateway
- User Service (PostgreSQL)
- Hero Service (PostgreSQL)
- Inventory Service (PostgreSQL)
- Dungeon Service (MongoDB + Redis)
- Combat Service (stateless)
- Log Service (Elasticsearch)

## Data
- SQL models in models/
- Monsters and dungeon runs in JSON models/

## API
- Swagger file: swagger.yaml

## scheme
![scheme](./schema.png)
