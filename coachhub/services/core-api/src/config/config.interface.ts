export interface AppConfig {
	nodeEnv: string;
	port: number;
	apiPrefix: string;
	frontendUrl: string;
	allowedOrigins: string[];
}

export interface DatabaseConfig {
	uri: string;
	synchronize: boolean;
}

export interface RabbitmqConfig {
	url: string;
}

export interface JwtTokenConfig {
	secret: string;
	expiresIn: string;
}

export interface JwtConfig {
	accessToken: JwtTokenConfig;
	refreshToken: JwtTokenConfig;
}

export interface AwsConfig {
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	s3: {
		bucket: string;
		acl: string;
		baseUrl: string;
	};
}

export interface ImageDimensions {
	width: number;
	height: number;
	maxSizeKB: number;
	path: string;
	allowedMimeTypes: string[];
}

export interface ImageTypes {
	coach: ImageDimensions;
	client: ImageDimensions;
	tenant: ImageDimensions;
}

export type ImageCategory = keyof ImageTypes;

export interface DocumentSpec {
	path: string;
	maxSizeMB: number;
	allowedMimeTypes: string[];
}

export interface DocumentTypes {
	certificate: DocumentSpec;
}

export interface GoogleOAuthConfig {
	clientId: string;
}

export interface AiConfig {
	geminiApiKey: string;
	aiRequestTimeoutMs: number;
}

export interface AnalyticsConfig {
	baseUrl: string;
	timeoutMs: number;
}

export interface Config {
	app: AppConfig;
	database: DatabaseConfig;
	rabbitmq: RabbitmqConfig;
	jwt: JwtConfig;
	aws: AwsConfig;
	imageTypes: ImageTypes;
	documentTypes: DocumentTypes;
	googleOauth: GoogleOAuthConfig;
	ai: AiConfig;
	analytics: AnalyticsConfig;
}
