import { Express, Response, Request } from "express";
import { UserServicePort} from "../../application/ports/inbound/UserServicePort";
import {createUserDTO, User} from "../../domain/models/User";

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
        res.status(201).json(created);
    }

    async findById(req: Request, res: Response) {
        const id = req.params.id;
        if(id) {
            const user = await this.userService.findById(id);
            if(!user)
            {
                return res.status(404).json({ message: 'User does not exist' });
            }
            res.status(200).json(user);
        }
    }

    async isNameTaken(req: Request, res: Response) {
        const name = req.params.name;
        if(!name) {
            return res.status(400).json({ message: 'Request badly formatted' });
        }
        const user = await this.userService.findByName(name);
        return res.status(200).json(user != null);
    }

    async delete(req: Request, res: Response) {
        const id = req.params.id;
        if(!id) {
            return res.status(400).json({ message: 'Request badly formatted' });
        }
        const user = await this.userService.delete(id);
        if(!user) {
            return res.status(404).json({ message: 'User does not exist' });
        }
        return res.status(200).json(user);
    }


    async update(req: Request, res: Response) {
        const { id, name, isAdmin } = req.body;
        const newUser = new User(id, name, isAdmin);
        const updated = await this.userService.update(newUser);
        if(!updated)
        {
            return res.status(404).json({ message: 'User does not exist' });
        }
        return res.status(200).json(newUser);
    }

    async connect(req: Request, res: Response) {
        const name = req.body.name;
        if(!name) {
            return res.status(400).json({ message: 'Request badly formatted' });
        }
        const retVal = await this.userService.connect(name);
        if(!retVal) {
            return res.status(404).json({ message: 'Auth failed' });
        }

        
        return res.status(200).json(retVal);
    }
}