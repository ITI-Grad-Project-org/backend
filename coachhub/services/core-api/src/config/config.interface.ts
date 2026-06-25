export interface AppConfig {
	nodeEnv: string;
	port: number;
	apiPrefix: string;
	frontendUrl: string;
}

export interface DatabaseConfig {
	uri: string;
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
}

export interface GoogleOAuthConfig {
	clientId: string;
}

export interface Config {
	app: AppConfig;
	database: DatabaseConfig;
	jwt: JwtConfig;
	aws: AwsConfig;
	imageTypes: ImageTypes;
	googleOauth: GoogleOAuthConfig;
}
