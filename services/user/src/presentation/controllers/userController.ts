import { Express, Response, Request } from "express";
import { UserServicePort} from "../../application/ports/inbound/UserServicePort";
import {createUserDTO, User} from "../../domain/models/User";
import { sendUserLog } from "../../application/logger";

export class UserController {
    constructor(private userService: UserServicePort) { }



    registerRoutes(app: Express) {
        app.get('/user', this.getAllUsers.bind(this));
        app.post('/user', this.createUser.bind(this));
        app.put('/user', this.update.bind(this))
        app.get('/user/check/:name', this.isNameTaken.bind(this));
        app.post('/user/connect', this.connect.bind(this));
        app.get('/user/:id', this.findById.bind(this));
        app.delete('/user/:id', this.delete.bind(this));

    }

    async getAllUsers(req: Request, res: Response) {
        const list = await this.userService.findAll();
        await sendUserLog(null, 1, 'users_listed', { count: list.length });
        res.json(list);
    }

    async createUser(req: Request, res: Response) {
        const { name, isAdmin } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'User name is required' });
        }
        const isNameTaken = await this.userService.findByName(name);
        if(isNameTaken) {
            return res.status(400).json({ message: 'User name is already taken' });
        }
        if(isAdmin == null)
        {
            return res.status(400).json({ message: 'User status is required' });
        }

        const created = await this.userService.create(new createUserDTO(name, isAdmin));
        
        const authResult = await this.userService.connect(name);
        if(!authResult) {
            await sendUserLog(null, 2, 'user_auth_failed', { name, reason: 'auth_failed_after_create' });
            return res.status(500).json({ message: 'User created but authentication failed' });
        }

        await sendUserLog(authResult.userId, 1, 'user_created', { name, isAdmin });
        await sendUserLog(authResult.userId, 1, 'user_connected', { name });
        
        res.status(201).json(authResult);
    }

    async findById(req: Request, res: Response) {
        const id = req.params.id;
        if(id) {
            const user = await this.userService.findById(id);
            if(!user)
            {
                await sendUserLog(id, 2, 'user_not_found', { user_id: id });
                return res.status(404).json({ message: 'User does not exist' });
            }
            await sendUserLog(user.id, 1, 'user_fetched', { user_id: user.id, name: user.name });
            res.status(200).json(user);
        }
    }

    async isNameTaken(req: Request, res: Response) {
        const name = req.params.name;
        if(!name) {
            return res.status(400).json({ message: 'Request badly formatted' });
        }
        const user = await this.userService.findByName(name);
        await sendUserLog(user?.id || null, 1, 'user_name_checked', { name, taken: user != null });
        return res.status(200).json(user != null);
    }

    async delete(req: Request, res: Response) {
        const id = req.params.id;
        if(!id) {
            return res.status(400).json({ message: 'Request badly formatted' });
        }
        const user = await this.userService.delete(id);
        if(!user) {
            await sendUserLog(id, 2, 'user_not_found', { user_id: id });
            return res.status(404).json({ message: 'User does not exist' });
        }
        await sendUserLog(user.id, 1, 'user_deleted', { user_id: user.id, name: user.name });
        return res.status(200).json(user);
    }


    async update(req: Request, res: Response) {
        const { id, name, isAdmin } = req.body;
        const newUser = new User(id, name, isAdmin);
        const updated = await this.userService.update(newUser);
        if(!updated)
        {
            await sendUserLog(id || null, 2, 'user_not_found', { user_id: id });
            return res.status(404).json({ message: 'User does not exist' });
        }
        await sendUserLog(updated.id, 1, 'user_updated', { user_id: updated.id, name: updated.name, isAdmin: updated.isAdmin });
        return res.status(200).json(newUser);
    }

    async connect(req: Request, res: Response) {
        const name = req.body.name;
        if(!name) {
            return res.status(400).json({ message: 'Request badly formatted' });
        }
        const retVal = await this.userService.connect(name);
        if(!retVal) {
            await sendUserLog(null, 2, 'user_auth_failed', { name, reason: 'auth_failed' });
            return res.status(404).json({ message: 'Auth failed' });
        }

        await sendUserLog(retVal.userId, 1, 'user_connected', { name });
        
        return res.status(200).json(retVal);
    }
}