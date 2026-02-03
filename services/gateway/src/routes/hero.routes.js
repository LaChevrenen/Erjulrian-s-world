import {Router} from 'express';
import {forward} from '../services/proxy.service.js';
import {auth} from '../middlewares/auth.middlewares.js';
const HERO_SERVICE_URL = 'http://hero-api:3003';

const heroRouter = Router();

// Create a hero
heroRouter.post('/', auth, (req, res) => {
    forward(req, res, HERO_SERVICE_URL);
});
// Get hero with Id
heroRouter.get('/:heroId', auth, (req, res) => {
    forward(req, res, HERO_SERVICE_URL);
});
// Get heroes for a user
heroRouter.get('/:userId/list', auth, (req, res) => {
    forward(req, res, HERO_SERVICE_URL);
})
// Modify hero with Id
heroRouter.put('/:heroId', auth, (req, res) => {
    forward(req, res, HERO_SERVICE_URL);
});
// Delete hero with Id
heroRouter.delete('/:heroId', auth, (req, res) => {
    forward(req, res, HERO_SERVICE_URL);
});
// Add xp to hero
heroRouter.post('/:heroId/xp', auth, (req, res) => {
    forward(req, res, HERO_SERVICE_URL);
});
// List all heroes
heroRouter.get('/:userId/list', auth, (req, res) => {
    forward(req, res, HERO_SERVICE_URL);
});

export default heroRouter;