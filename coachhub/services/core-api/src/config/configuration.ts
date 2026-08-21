// Browsers reject `Access-Control-Allow-Origin: *` on credentialed requests, so
// the origins have to be listed explicitly and reflected back one at a time.
export const allowedOrigins = (): string[] =>
	(
		process.env.ALLOWED_ORIGINS ||
		process.env.FRONTEND_URL ||
		'http://localhost:5173'
	)
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);

export default () => ({
	app: {
		nodeEnv: process.env.NODE_ENV || 'development',
		port: parseInt(process.env.PORT as string, 10) || 3000,
		apiPrefix: process.env.API_PREFIX || 'api',
		frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
		allowedOrigins: allowedOrigins(),
	},
	database: {
		uri: process.env.DATABASE_URL,
		// Schema sync is a dev-only convenience; production must run migrations.
		synchronize: process.env.DB_SYNCHRONIZE
			? process.env.DB_SYNCHRONIZE === 'true'
			: (process.env.NODE_ENV || 'development') === 'development',
	},

	rabbitmq: {
		url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
	},

	redis: {
		url: process.env.REDIS_URL || 'redis://localhost:6379',
	},

	jwt: {
		accessToken: {
			secret: process.env.JWT_ACCESS_SECRET,
			expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '7d',
		},
		refreshToken: {
			secret: process.env.JWT_REFRESH_SECRET,
			expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
		},
	},

	ai: {
		geminiApiKey: process.env.GEMINI_API_KEY,
		aiRequestTimeoutMs:
			parseInt(process.env.AI_REQUEST_TIMEOUT_MS as string, 10) || 30000,
	},

	analytics: {
		// In-cluster ClusterIP address. analytics-service is never exposed
		// through the ingress; core-api is its only caller and the edge that
		// authenticates the request.
		baseUrl:
			process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:8082',
		// Aggregations run over core_db with a 5-connection pool. Failing fast
		// keeps a slow report from tying up a core-api worker.
		timeoutMs:
			parseInt(process.env.ANALYTICS_REQUEST_TIMEOUT_MS as string, 10) || 10000,
	},

	paymob: {
		baseUrl: process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com',
		apiKey: process.env.PAYMOB_API_KEY,
		publicKey: process.env.PAYMOB_PUBLIC_KEY,
		secretKey: process.env.PAYMOB_SECRET_KEY,
		hmacSecret: process.env.PAYMOB_HMAC_SECRET,
		cardIntegrationId: parseInt(
			process.env.PAYMOB_INTEGRATION_ID_CARD as string,
			10,
		),
		notificationUrl:
			process.env.PAYMOB_NOTIFICATION_URL ||
			'http://localhost:3000/billing/paymob/webhook',
		redirectionUrl:
			process.env.PAYMOB_REDIRECTION_URL ||
			`${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing/result`,
		requestTimeoutMs:
			parseInt(process.env.PAYMOB_REQUEST_TIMEOUT_MS as string, 10) || 15000,
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
			allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
		},
		client: {
			width: 800,
			height: 600,
			maxSizeKB: 1024,
			path: 'clients',
			allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
		},
		tenant: {
			width: 512,
			height: 512,
			maxSizeKB: 512,
			path: 'tenants',
			allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
		},
	},

	documentTypes: {
		// Coach certificates — accepted as a PDF or a photo scan. Stored as-is
		// (no image optimization), so a PDF stays a PDF.
		certificate: {
			path: 'certificates',
			maxSizeMB: 10,
			allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
		},
	},
});
