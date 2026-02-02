import {User, createUserDTO} from "../../domain/models/User";
import {UserRepositoryPort} from "../../application/ports/outbound/UserRepositoryPort";
import { Client } from "pg";


import { v4 as uuidv4 } from 'uuid';

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: (process.env.DB_PORT || 5432) as number,
    user: process.env.DB_USER || 'user_user',
    password: process.env.DB_PASSWORD || 'user_password',
    database: process.env.DB_NAME || 'erjulrian'
};

export class UserRepositoryAdapter implements UserRepositoryPort {
    
    private dbClient: Client;
    constructor() {
        this.dbClient = new Client(dbConfig);
        this.connect();
    }

    private async connect(retries = 5) {
        for (let i = 0; i < retries; i++) {
            try {
                await this.dbClient.connect();
                console.log('✅ Connected to PostgreSQL database');
                return;
            } catch(error) {
                console.error(`❌ DB connection attempt ${i + 1}/${retries} failed:`, error.message);
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }
        throw new Error('Failed to connect to database after multiple retries');
    }

    async findAll(): Promise<User[]> {
        const result = await this.dbClient.query('SELECT * FROM users');
        return result.rows.map(row => new User(row.id, row.username, row.is_admin));
    }


    async findById(id: string): Promise<User | null> {
        const result = await this.dbClient.query(
            'SELECT * FROM users WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const row = result.rows[0];
        return new User(row.id, row.username, row.is_admin);
    }

    async findByName(name: string): Promise<User | null> {
        const result = await this.dbClient.query(
            'SELECT * FROM users WHERE username = $1',
            [name]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const row = result.rows[0];
        return new User(row.id, row.name, row.is_admin);
    }

    async create(user: createUserDTO): Promise<User> {
        const uuid = uuidv4();
        
        const result = await this.dbClient.query(
            'INSERT INTO users (id, username, is_admin) VALUES ($1, $2, $3) RETURNING *',
            [uuid, user.name, user.isAdmin]
        );
        
        const row = result.rows[0];
        return new User(row.id, row.username, row.is_admin);
    }

    async delete(id: string): Promise<User | null> {
        const result = await this.dbClient.query(
            'DELETE FROM users WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const row = result.rows[0];
        return new User(row.id, row.username, row.is_admin);
    }

    async update(user: User): Promise<User | null> {
        const result = await this.dbClient.query(
            'UPDATE users SET username = $1, is_admin = $2 WHERE id = $3 RETURNING *',
            [user.name, user.isAdmin, user.id]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const row = result.rows[0];
        return new User(row.id, row.username, row.is_admin);
    }

    async close() {
        await this.dbClient.end();
    }
    
}