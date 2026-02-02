import Router from 'express';
import {forward} from '../services/proxy.service.js';
import {auth} from '../middlewares/auth.middlewares.js';
const INVENTORY_SERVICE_URL = 'http://localhost:3004';

const inventoryRouter = Router();
// Create inventory
inventoryRouter.post('/', (req, res) => {
    forward(req, res, INVENTORY_SERVICE_URL);
});
// Get inventory for a Hero
inventoryRouter.get('/:heroId', auth, (req, res) => {
    forward(req, res, INVENTORY_SERVICE_URL);
});
// Modify the inventory of hero
inventoryRouter.put('/:heroId', auth, (req, res) => {
    forward(req, res, INVENTORY_SERVICE_URL);
});
// Delete inventory of hero
inventoryRouter.delete('/:heroId', auth, (req, res) => {
    forward(req, res, INVENTORY_SERVICE_URL);
});

export default inventoryRouter;