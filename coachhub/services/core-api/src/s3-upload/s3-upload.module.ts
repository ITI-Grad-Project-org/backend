import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule } from '../config';
import { S3UploadService } from './s3-upload.service';
import { S3UploadController } from './s3-upload.controller';
import { fileUploadMulterOptions } from './multer.config';

@Module({
	imports: [ConfigModule, MulterModule.register(fileUploadMulterOptions)],
	controllers: [S3UploadController],
	providers: [S3UploadService],
	exports: [S3UploadService],
})
export class S3UploadModule {}
