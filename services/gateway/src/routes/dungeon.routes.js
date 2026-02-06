import {Router} from 'express';
import {forward} from '../services/proxy.service.js';
import {auth} from '../middlewares/auth.middlewares.js';
const DUNGEON_SERVICE_URL = 'http://dungeon-api:3005';

const dungeonRouter = Router();
dungeonRouter.get('/', auth, (req, res) => {
    forward(req, res, DUNGEON_SERVICE_URL);
});
dungeonRouter.post('/start', auth, (req, res) => {
    forward(req, res, DUNGEON_SERVICE_URL);
});
dungeonRouter.get('/:runId', auth, (req, res) => {
    forward(req, res, DUNGEON_SERVICE_URL);
});
dungeonRouter.delete('/:runId', auth, (req, res) => {
    forward(req, res, DUNGEON_SERVICE_URL);
});
dungeonRouter.get('/:runId/choices', auth, (req, res) => {
    forward(req, res, DUNGEON_SERVICE_URL);
});
dungeonRouter.post('/:heroId/choose', auth, (req, res) => {
    forward(req, res, DUNGEON_SERVICE_URL);
});
dungeonRouter.post('/:heroId/finish', auth, (req, res) => {
    forward(req, res, DUNGEON_SERVICE_URL);
});

export default dungeonRouter;