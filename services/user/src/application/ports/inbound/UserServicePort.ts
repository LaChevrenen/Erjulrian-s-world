import {createUserDTO, User} from "../../../domain/models/User";


export interface UserServicePort {
    findById(id: string): Promise<User | null>;
    findByName(name: string): Promise<User | null>;
    findAll(): Promise<User[]>;
    connect(name: string): Promise<{token:string, userId: string} | null>;
    create(data: createUserDTO): Promise<User | null>;
    update(data: User): Promise<User | null>;
    delete(id: string): Promise<User | null>;
}