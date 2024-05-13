// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { ConsoleLogger } from './Logger';
import { AmplifyError } from './errors';
import {
	AuthConfigUserAttributes,
	LegacyUserAttributeKey,
	OAuthConfig,
	OAuthProvider,
} from './singleton/Auth/types';
import { ResourcesConfig } from './singleton/types';

const logger = new ConsoleLogger('parseAWSExports');

const authTypeMapping: Record<any, any> = {
	API_KEY: 'apiKey',
	AWS_IAM: 'iam',
	AMAZON_COGNITO_USER_POOLS: 'userPool',
	OPENID_CONNECT: 'oidc',
	NONE: 'none',
	AWS_LAMBDA: 'lambda',
	// `LAMBDA` is an incorrect value that was added during the v6 rewrite.
	// Keeping it as a valid value until v7 to prevent breaking customers who might
	// be relying on it as a workaround.
	// ref: https://github.com/aws-amplify/amplify-js/pull/12922
	// TODO: @v7 remove next line
	LAMBDA: 'lambda',
};

/**
 * Converts the object imported from `aws-exports.js` or `amplifyconfiguration.json` files generated by
 * the Amplify CLI into an object that conforms to the {@link ResourcesConfig}.
 *
 * @param config A configuration object imported  from `aws-exports.js` or `amplifyconfiguration.json`.
 *
 * @returns An object that conforms to the {@link ResourcesConfig} .
 */

export const parseAWSExports = (
	config: Record<string, any> = {},
): ResourcesConfig => {
	if (!Object.prototype.hasOwnProperty.call(config, 'aws_project_region')) {
		throw new AmplifyError({
			name: 'InvalidParameterException',
			message: 'Invalid config parameter.',
			recoverySuggestion:
				'Ensure passing the config object imported from  `amplifyconfiguration.json`.',
		});
	}

	const {
		aws_appsync_apiKey,
		aws_appsync_authenticationType,
		aws_appsync_graphqlEndpoint,
		aws_appsync_customEndpoint,
		aws_appsync_region,
		aws_bots_config,
		aws_cognito_identity_pool_id,
		aws_cognito_sign_up_verification_method,
		aws_cognito_mfa_configuration,
		aws_cognito_mfa_types,
		aws_cognito_password_protection_settings,
		aws_cognito_verification_mechanisms,
		aws_cognito_signup_attributes,
		aws_cognito_social_providers,
		aws_cognito_username_attributes,
		aws_mandatory_sign_in,
		aws_mobile_analytics_app_id,
		aws_mobile_analytics_app_region,
		aws_user_files_s3_bucket,
		aws_user_files_s3_bucket_region,
		aws_user_files_s3_dangerously_connect_to_http_endpoint_for_testing,
		aws_user_pools_id,
		aws_user_pools_web_client_id,
		geo,
		oauth,
		predictions,
		aws_cloud_logic_custom,
		Notifications,
		modelIntrospection,
	} = config;
	const amplifyConfig: ResourcesConfig = {};

	// Analytics
	if (aws_mobile_analytics_app_id) {
		amplifyConfig.Analytics = {
			Pinpoint: {
				appId: aws_mobile_analytics_app_id,
				region: aws_mobile_analytics_app_region,
			},
		};
	}

	// Notifications
	const { InAppMessaging, Push } = Notifications ?? {};
	if (InAppMessaging?.AWSPinpoint || Push?.AWSPinpoint) {
		if (InAppMessaging?.AWSPinpoint) {
			const { appId, region } = InAppMessaging.AWSPinpoint;
			amplifyConfig.Notifications = {
				InAppMessaging: {
					Pinpoint: {
						appId,
						region,
					},
				},
			};
		}
		if (Push?.AWSPinpoint) {
			const { appId, region } = Push.AWSPinpoint;
			amplifyConfig.Notifications = {
				...amplifyConfig.Notifications,
				PushNotification: {
					Pinpoint: {
						appId,
						region,
					},
				},
			};
		}
	}

	// Interactions
	if (Array.isArray(aws_bots_config)) {
		amplifyConfig.Interactions = {
			LexV1: Object.fromEntries(aws_bots_config.map(bot => [bot.name, bot])),
		};
	}

	// API
	if (aws_appsync_graphqlEndpoint) {
		const defaultAuthMode = authTypeMapping[aws_appsync_authenticationType];
		if (!defaultAuthMode) {
			logger.debug(
				`Invalid authentication type ${aws_appsync_authenticationType}. Falling back to IAM.`,
			);
		}
		amplifyConfig.API = {
			GraphQL: {
				endpoint: aws_appsync_graphqlEndpoint,
				customEndpoint: aws_appsync_customEndpoint,
				apiKey: aws_appsync_apiKey,
				region: aws_appsync_region,
				defaultAuthMode: defaultAuthMode ?? 'iam',
			},
		};
		if (modelIntrospection) {
			amplifyConfig.API.GraphQL!.modelIntrospection = modelIntrospection;
		}
	}

	// Auth
	const mfaConfig = aws_cognito_mfa_configuration
		? {
				status:
					aws_cognito_mfa_configuration &&
					aws_cognito_mfa_configuration.toLowerCase(),
				totpEnabled: aws_cognito_mfa_types?.includes('TOTP') ?? false,
				smsEnabled: aws_cognito_mfa_types?.includes('SMS') ?? false,
			}
		: undefined;
	const passwordFormatConfig = aws_cognito_password_protection_settings
		? {
				minLength:
					aws_cognito_password_protection_settings.passwordPolicyMinLength,
				requireLowercase:
					aws_cognito_password_protection_settings.passwordPolicyCharacters?.includes(
						'REQUIRES_LOWERCASE',
					) ?? false,
				requireUppercase:
					aws_cognito_password_protection_settings.passwordPolicyCharacters?.includes(
						'REQUIRES_UPPERCASE',
					) ?? false,
				requireNumbers:
					aws_cognito_password_protection_settings.passwordPolicyCharacters?.includes(
						'REQUIRES_NUMBERS',
					) ?? false,
				requireSpecialCharacters:
					aws_cognito_password_protection_settings.passwordPolicyCharacters?.includes(
						'REQUIRES_SYMBOLS',
					) ?? false,
			}
		: undefined;
	const mergedUserAttributes: LegacyUserAttributeKey[] = Array.from(
		new Set([
			...(aws_cognito_verification_mechanisms ?? []),
			...(aws_cognito_signup_attributes ?? []),
		]),
	);

	const userAttributes: AuthConfigUserAttributes = mergedUserAttributes.reduce(
		(attributes: AuthConfigUserAttributes, key: LegacyUserAttributeKey) => ({
			...attributes,
			// All user attributes generated by the CLI are required
			[key.toLowerCase()]: { required: true },
		}),
		{},
	);

	const loginWithEmailEnabled =
		aws_cognito_username_attributes?.includes('EMAIL') ?? false;
	const loginWithPhoneEnabled =
		aws_cognito_username_attributes?.includes('PHONE_NUMBER') ?? false;
	if (aws_cognito_identity_pool_id || aws_user_pools_id) {
		amplifyConfig.Auth = {
			Cognito: {
				identityPoolId: aws_cognito_identity_pool_id,
				allowGuestAccess: aws_mandatory_sign_in !== 'enable',
				signUpVerificationMethod: aws_cognito_sign_up_verification_method,
				userAttributes,
				userPoolClientId: aws_user_pools_web_client_id,
				userPoolId: aws_user_pools_id,
				mfa: mfaConfig,
				passwordFormat: passwordFormatConfig,
				loginWith: {
					username: !(loginWithEmailEnabled || loginWithPhoneEnabled),
					email: loginWithEmailEnabled,
					phone: loginWithPhoneEnabled,
				},
			},
		};
	}

	const hasOAuthConfig = oauth ? Object.keys(oauth).length > 0 : false;
	const hasSocialProviderConfig = aws_cognito_social_providers
		? aws_cognito_social_providers.length > 0
		: false;
	if (amplifyConfig.Auth && hasOAuthConfig) {
		amplifyConfig.Auth.Cognito.loginWith = {
			...amplifyConfig.Auth.Cognito.loginWith,
			oauth: {
				...getOAuthConfig(oauth),
				...(hasSocialProviderConfig && {
					providers: parseSocialProviders(aws_cognito_social_providers),
				}),
			},
		};
	}

	// Storage
	if (aws_user_files_s3_bucket) {
		amplifyConfig.Storage = {
			S3: {
				bucket: aws_user_files_s3_bucket,
				region: aws_user_files_s3_bucket_region,
				dangerouslyConnectToHttpEndpointForTesting:
					aws_user_files_s3_dangerously_connect_to_http_endpoint_for_testing,
			},
		};
	}

	// Geo
	if (geo) {
		const { amazon_location_service } = geo;
		amplifyConfig.Geo = {
			LocationService: {
				maps: amazon_location_service.maps,
				geofenceCollections: amazon_location_service.geofenceCollections,
				searchIndices: amazon_location_service.search_indices,
				region: amazon_location_service.region,
			},
		};
	}

	// REST API
	if (aws_cloud_logic_custom) {
		amplifyConfig.API = {
			...amplifyConfig.API,
			REST: (aws_cloud_logic_custom as any[]).reduce(
				(acc, api: Record<string, any>) => {
					const { name, endpoint, region, service } = api;

					return {
						...acc,
						[name]: {
							endpoint,
							...(service ? { service } : undefined),
							...(region ? { region } : undefined),
						},
					};
				},
				{},
			),
		};
	}

	// Predictions
	if (predictions) {
		// map VoiceId from speechGenerator defaults to voiceId
		const { VoiceId: voiceId } =
			predictions?.convert?.speechGenerator?.defaults ?? {};
		amplifyConfig.Predictions = voiceId
			? {
					...predictions,
					convert: {
						...predictions.convert,
						speechGenerator: {
							...predictions.convert.speechGenerator,
							defaults: { voiceId },
						},
					},
				}
			: predictions;
	}

	return amplifyConfig;
};

const getRedirectUrl = (redirectStr: string): string[] =>
	redirectStr?.split(',') ?? [];

const getOAuthConfig = ({
	domain,
	scope,
	redirectSignIn,
	redirectSignOut,
	responseType,
}: Record<string, any>): OAuthConfig => ({
	domain,
	scopes: scope,
	redirectSignIn: getRedirectUrl(redirectSignIn),
	redirectSignOut: getRedirectUrl(redirectSignOut),
	responseType,
});

const parseSocialProviders = (aws_cognito_social_providers: string[]) => {
	return aws_cognito_social_providers.map((provider: string) => {
		const updatedProvider = provider.toLowerCase();

		return updatedProvider.charAt(0).toUpperCase() + updatedProvider.slice(1);
	}) as OAuthProvider[];
};
