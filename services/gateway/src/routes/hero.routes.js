import {Router} from 'express';
import {forward} from '../services/proxy.service.js';
import {auth} from '../middlewares/auth.middlewares.js';
const HERO_SERVICE_URL = 'http://hero-api:3003';

const heroRouter = Router();

heroRouter.get('/:userId/list', auth, (req, res) => {
    forward(req, res, HERO_SERVICE_URL);
});
heroRouter.post('/', auth, (req, res) => {
    forward(req, res, HERO_SERVICE_URL);
});
heroRouter.get('/:heroId', auth, (req, res) => {
    forward(req, res, HERO_SERVICE_URL);
});
heroRouter.put('/:heroId', auth, (req, res) => {
    forward(req, res, HERO_SERVICE_URL);
});
heroRouter.delete('/:heroId', auth, (req, res) => {
    forward(req, res, HERO_SERVICE_URL);
});
heroRouter.post('/:heroId/xp', auth, (req, res) => {
    forward(req, res, HERO_SERVICE_URL);
});

export default heroRouter;