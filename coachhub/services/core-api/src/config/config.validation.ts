import * as z from 'zod';

export const ConfigSchema = z.object({
	app: z.object({
		nodeEnv: z.string().default('development'),
		port: z.coerce.number().default(3000),
		apiPrefix: z.string().default('api'),
		frontendUrl: z.string().default('http://localhost:5173'),
	}),
	database: z.object({
		uri: z.string(),
		synchronize: z.boolean().default(false),
	}),
	rabbitmq: z.object({
		url: z.string(),
	}),
	ai: z.object({
		geminiApiKey: z.string(),
		aiRequestTimeoutMs: z.coerce.number().default(30000),
	}),
	jwt: z.object({
		accessToken: z.object({
			secret: z.string(),
			expiresIn: z.string().default('15m'),
		}),
		refreshToken: z.object({
			secret: z.string(),
			expiresIn: z.string().default('30d'),
		}),
	}),
	aws: z.object({
		region: z.string().default('us-east-1'),
		accessKeyId: z.string(),
		secretAccessKey: z.string(),
		s3: z.object({
			bucket: z.string(),
			acl: z.string().default('public-read'),
			baseUrl: z.string(),
		}),
	}),
	googleOauth: z.object({
		clientId: z.string(),
	}),
	imageTypes: z.object({
		coach: z.object({
			width: z.number(),
			height: z.number(),
			maxSizeKB: z.number(),
			path: z.string(),
			allowedMimeTypes: z.array(z.string()),
		}),
		client: z.object({
			width: z.number(),
			height: z.number(),
			maxSizeKB: z.number(),
			path: z.string(),
			allowedMimeTypes: z.array(z.string()),
		}),
	}),
});
