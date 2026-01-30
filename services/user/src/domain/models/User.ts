export class User
{
    id: string;
    name: string;
    isAdmin: boolean;

    constructor(id: string, name: string, isAdmin: boolean) {
        this.id = id;
        this.name = name;
        this.isAdmin = isAdmin;
    }

}

export class createUserDTO {
    name: string;
    isAdmin: boolean;

    constructor(name: string, isAdmin: boolean) {
        this.name = name;
        this.isAdmin = isAdmin;
    }
}