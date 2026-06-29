export default () => ( {
	app: {
		nodeEnv: process.env.NODE_ENV || 'development',
		port: parseInt( process.env.PORT as string, 10 ) || 3000,
		apiPrefix: process.env.API_PREFIX || 'api',
		frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
	},
	database: {
		uri: process.env.DATABASE_URL,
	},

	rabbitmq: {
		url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
	},

	jwt: {
		accessToken: {
			secret: process.env.JWT_ACCESS_SECRET,
			expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
		},
		refreshToken: {
			secret: process.env.JWT_REFRESH_SECRET,
			expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
		},
	},

	ai: {
		geminiApiKey: process.env.GEMINI_API_KEY,
		aiRequestTimeoutMs: parseInt( process.env.AI_REQUEST_TIMEOUT_MS as string,
			10 ) || 30000,
	},

	aws: {
		region: process.env.AWS_REGION || 'us-east-1',
		accessKeyId: process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
		s3: {
			bucket: process.env.AWS_S3_BUCKET,
			acl: process.env.AWS_S3_ACL || 'public-read',
			baseUrl:
				process.env.AWS_S3_BASE_URL ||
				`https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`,
		},
	},

	googleOauth: {
		clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
	},

	imageTypes: {
		coach: {
			width: 400,
			height: 400,
			maxSizeKB: 512,
			path: 'coaches',
			allowedMimeTypes: [ 'image/jpeg', 'image/png', 'image/webp' ],
		},
		client: {
			width: 800,
			height: 600,
			maxSizeKB: 1024,
			path: 'clients',
			allowedMimeTypes: [ 'image/jpeg', 'image/png', 'image/webp' ],
		},
	},
} );
