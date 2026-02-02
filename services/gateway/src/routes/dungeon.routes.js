import {Router} from 'express';
import {forward} from '../services/proxy.service.js';
import {auth} from '../middlewares/auth.middlewares.js';
const DUNGEON_SERVICE_URL = 'http://dungeon-api:3005';

const dungeonRouter = Router();

// Start dungeon run
dungeonRouter.post('/', auth, (req, res) => {
    forward(req, res, DUNGEON_SERVICE_URL);
});
// Get dungeon run
dungeonRouter.get('/:runId', auth, (req, res) => {
    forward(req, res, DUNGEON_SERVICE_URL);
});
// Get available room choices
dungeonRouter.get('/:runId/choices', auth, (req, res) => {
    forward(req, res, DUNGEON_SERVICE_URL);
});
// Choose next room from available options
dungeonRouter.post('/:heroId/choose', auth, (req, res) => {
    forward(req, res, DUNGEON_SERVICE_URL);
});
// Finish dungeon run
dungeonRouter.post('/:heroId/finish', auth, (req, res) => {
    forward(req, res, DUNGEON_SERVICE_URL);
});

export default dungeonRouter;