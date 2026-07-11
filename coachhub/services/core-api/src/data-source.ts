import 'reflect-metadata';
import { DataSource } from 'typeorm';

/**
 * TypeORM CLI data source — used by `migration:generate` / `migration:run`,
 * never by the running app (that config lives in DatabaseModule).
 *
 * Compiled to dist/data-source.js, so the production image can run
 * migrations without ts-node (the K8s migration Job does exactly that).
 */
export default new DataSource({
	type: 'postgres',
	url: process.env.DATABASE_URL,
	entities: [__dirname + '/**/*.entity{.ts,.js}'],
	migrations: [__dirname + '/migrations/*{.ts,.js}'],
	synchronize: false,
});
