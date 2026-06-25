import {
	Column,
	CreateDateColumn,
	DeleteDateColumn,
	Entity,
	OneToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn
}               from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity()
export class Tenant {
	@PrimaryGeneratedColumn()
	id: number;

	@Column( { nullable: false } )
	name: string;

	@Column( { nullable: false, unique: true } )
	slug: string;

	@CreateDateColumn()
	created_at: Date;

	@UpdateDateColumn()
	updated_at: Date;

	@DeleteDateColumn()
	deleted_at: Date;

	@OneToOne( () => User, ( user ) => user.tenant )
	user: User;
}


