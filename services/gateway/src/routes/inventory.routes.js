import {Router} from 'express';
import {forward} from '../services/proxy.service.js';
import {auth} from '../middlewares/auth.middlewares.js';
const INVENTORY_SERVICE_URL = 'http://inventory-api:3004';

const inventoryRouter = Router();

inventoryRouter.post('/', (req, res) => {
    forward(req, res, INVENTORY_SERVICE_URL);
});
inventoryRouter.post('/:heroId/upgrade/:artifactId', auth, (req, res) => {
    forward(req, res, INVENTORY_SERVICE_URL);
});
inventoryRouter.patch('/:itemId/equip', auth, (req, res) => {
    forward(req, res, INVENTORY_SERVICE_URL);
});
inventoryRouter.get('/:heroId/upgrade-info/:artifactId', auth, (req, res) => {
    forward(req, res, INVENTORY_SERVICE_URL);
});
inventoryRouter.get('/:heroId', auth, (req, res) => {
    forward(req, res, INVENTORY_SERVICE_URL);
});
inventoryRouter.put('/:heroId', auth, (req, res) => {
    forward(req, res, INVENTORY_SERVICE_URL);
});
inventoryRouter.delete('/:heroId', auth, (req, res) => {
    forward(req, res, INVENTORY_SERVICE_URL);
});

export default inventoryRouter;