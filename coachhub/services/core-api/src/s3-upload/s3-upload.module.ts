import { Module }             from '@nestjs/common';
import { MulterModule }       from '@nestjs/platform-express';
import { memoryStorage }      from 'multer';
import { ConfigModule }       from '../config';
import { S3UploadService }    from './s3-upload.service';
import { S3UploadController } from './s3-upload.controller';

@Module( {
	imports: [
		ConfigModule,
		MulterModule.register( {
			storage: memoryStorage(),
			fileFilter: ( req, file, callback ) => {
				if ( !file.originalname.match( /\.(jpg|jpeg|png|gif|webp)$/ ) ) {
					return callback( new Error( 'Only image files are allowed!' ),
						false );
				}
				callback( null, true );
			},
			limits: {
				fileSize: 5 * 1024 * 1024, // 5MB limit
			},
		} ),
	],
	controllers: [ S3UploadController ],
	providers: [ S3UploadService ],
	exports: [ S3UploadService ],
} )
export class S3UploadModule {}
