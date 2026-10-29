// Auto-detect platforms and components from a project's files. Only reads files; never runs project code.
// Results are suggestions: the wizard and the UI show the evidence and ask the developer to confirm.
// Files come through a FileSource, so the same rules run on disk (CLI) and on files picked in a browser.
import type { Platform } from './types.js';

/** Read-only view of a project. Paths are relative to the project root and use "/". */
export interface FileSource {
  /** Text content, or undefined when the file is missing, too large or unreadable. */
  read(path: string): string | undefined;
  /** Entries directly inside a directory ("" = root); subdirectory names end with "/". */
  list(dir: string): string[];
}

const pj = (...parts: string[]) => parts.filter(Boolean).join('/');
const base = (path: string) => path.split('/').filter(Boolean).pop() ?? '';
const exists = (src: FileSource, path: string) => {
  const i = path.lastIndexOf('/');
  return src.list(i === -1 ? '' : path.slice(0, i)).some((e) => e.replace(/\/$/, '') === path.slice(i + 1));
};

export interface DetectedComponent {
  type: string;
  name?: string;
  options: Record<string, unknown>;
  evidence: string[];
}

export interface Detection {
  name?: string;
  platforms: Platform[];
  platformEvidence: Partial<Record<Platform, string[]>>;
  components: DetectedComponent[];
}

// Entries ending in "/" match every package in that npm scope.
const PLATFORM_DEPS: Record<Platform, string[]> = {
  web: ['react-dom', 'vue', 'svelte', '@angular/core', 'next', 'nuxt', 'vite', 'solid-js', '@remix-run/react', 'astro', '@sveltejs/kit'],
  backend: ['express', 'fastify', 'koa', '@nestjs/core', 'hono', 'next', 'nuxt', '@remix-run/node', '@hapi/hapi', '@sveltejs/kit', 'firebase-functions'],
  android: ['react-native', 'expo', '@capacitor/android', 'nativescript'],
  ios: ['react-native', 'expo', '@capacitor/ios', 'nativescript'],
  // Cloud comes from infrastructure code and AWS packages (see awsFromIac below).
  cloud: [],
};

const AUTH_METHOD_DEPS: Record<string, string[]> = {
  email_password: ['bcrypt', 'bcryptjs', 'argon2', '@node-rs/argon2', '@node-rs/bcrypt', 'passport-local'],
  oauth: [
    'passport-oauth2', 'passport-google-oauth20', 'passport-github2', 'passport-facebook', 'openid-client',
    'next-auth', '@auth/core', '@auth/express', 'simple-oauth2', 'grant', 'expo-auth-session',
    '@react-native-google-signin/google-signin', 'react-native-app-auth', '@auth0/',
  ],
  passkey: ['@simplewebauthn/server', '@simplewebauthn/browser'],
  otp_sms: ['twilio'],
};
const AUTH_GENERIC_DEPS = [
  'jsonwebtoken', 'jose', 'passport', 'express-session', '@fastify/session', 'iron-session', 'cookie-session',
  'lucia', 'better-auth', '@clerk/', '@supabase/auth-js', 'otplib', 'speakeasy',
];

export const ENGINE_KIND: Record<string, 'sql' | 'nosql'> = {
  postgres: 'sql', mysql: 'sql', sqlite: 'sql', mssql: 'sql', oracle: 'sql',
  mongodb: 'nosql', dynamodb: 'nosql', firestore: 'nosql', redis: 'nosql',
};
const DB_ENGINE_DEPS: Record<string, string[]> = {
  postgres: ['pg', 'postgres', 'pg-promise', '@neondatabase/serverless', '@vercel/postgres'],
  mysql: ['mysql', 'mysql2', '@planetscale/database'],
  sqlite: ['sqlite3', 'better-sqlite3', 'sqlite', '@libsql/client'],
  mssql: ['mssql', 'tedious'],
  oracle: ['oracledb'],
  mongodb: ['mongodb', 'mongoose'],
  dynamodb: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb', 'dynamoose'],
  firestore: ['firebase-admin', '@google-cloud/firestore'],
  redis: ['redis', 'ioredis', '@upstash/redis'],
};
const SQL_ORM_DEPS = ['prisma', '@prisma/client', 'drizzle-orm', 'typeorm', 'sequelize', 'knex', 'kysely', '@mikro-orm/core'];
const PRISMA_PROVIDERS: Record<string, string> = {
  postgresql: 'postgres', cockroachdb: 'postgres', mysql: 'mysql', sqlite: 'sqlite', sqlserver: 'mssql', mongodb: 'mongodb',
};

const UPLOAD_DEPS = [
  'multer', 'busboy', 'formidable', 'express-fileupload', '@fastify/multipart', 'multiparty', 'uploadthing',
  '@uploadthing/react', 'react-dropzone', 'filepond', '@uppy/core', 'expo-image-picker', 'expo-document-picker',
  'react-native-image-picker', 'react-native-document-picker',
];
const IMAGE_DEPS = ['sharp', 'jimp', 'expo-image-picker', 'react-native-image-picker'];
const OBJECT_STORAGE_DEPS = [
  '@aws-sdk/client-s3', 'aws-sdk', '@google-cloud/storage', '@azure/storage-blob', 'cloudinary', 'uploadthing', '@vercel/blob', 'minio',
];

const SESSION_DEPS: Record<string, { kind?: string; transport?: string }> = {
  'express-session': { kind: 'server_session', transport: 'cookie' },
  '@fastify/session': { kind: 'server_session', transport: 'cookie' },
  '@fastify/secure-session': { kind: 'server_session', transport: 'cookie' },
  'cookie-session': { kind: 'server_session', transport: 'cookie' },
  'iron-session': { kind: 'server_session', transport: 'cookie' },
  'next-auth': { transport: 'cookie' },
  jsonwebtoken: { kind: 'jwt' },
  jose: { kind: 'jwt' },
  '@fastify/jwt': { kind: 'jwt' },
  'passport-jwt': { kind: 'jwt', transport: 'authorization_header' },
};

const API_SERVER_DEPS = ['express', 'fastify', 'koa', '@nestjs/core', 'hono', '@hapi/hapi', 'restify'];
const API_STYLE_DEPS: Record<string, string[]> = {
  graphql: ['graphql', '@apollo/server', 'apollo-server', 'graphql-yoga', 'mercurius', 'type-graphql', '@nestjs/graphql'],
  websocket: ['ws', 'socket.io', '@fastify/websocket', 'uWebSockets.js'],
  grpc: ['@grpc/grpc-js', '@connectrpc/connect'],
};

const PAYMENT_PROVIDER_DEPS: Record<string, string[]> = {
  stripe: ['stripe', '@stripe/stripe-js', '@stripe/react-stripe-js', '@stripe/stripe-react-native'],
  paypal: ['@paypal/checkout-server-sdk', '@paypal/paypal-server-sdk', '@paypal/react-paypal-js', '@paypal/paypal-js'],
  braintree: ['braintree', 'braintree-web'],
  adyen: ['@adyen/api-library', '@adyen/adyen-web'],
  razorpay: ['razorpay', 'react-native-razorpay'],
  square: ['square', '@square/web-sdk'],
};
// One library serves both stores; the wizard narrows it down.
const IAP_DEPS = ['react-native-iap', 'expo-in-app-purchases', 'react-native-purchases', '@revenuecat/purchases-capacitor'];

const SECRET_STORE_DEPS = [
  '@aws-sdk/client-secrets-manager', '@aws-sdk/client-ssm', '@google-cloud/secret-manager', '@azure/keyvault-secrets',
  'node-vault', '@infisical/sdk', '@dopplerhq/node-sdk',
];
const ENV_DEPS = ['dotenv', 'dotenv-flow', '@t3-oss/env-core', '@t3-oss/env-nextjs', 'envalid'];

const LOGGER_DEPS = ['winston', 'pino', 'bunyan', 'morgan', 'log4js', 'consola', 'nestjs-pino'];
const LOG_SERVICE_DEPS = ['@sentry/', 'dd-trace', '@datadog/', '@elastic/ecs-winston-format', '@opentelemetry/', '@logtail/', 'newrelic'];

const MOBILE_STORAGE_DEPS = [
  '@react-native-async-storage/async-storage', 'react-native-mmkv', 'expo-secure-store', 'react-native-keychain',
  'react-native-encrypted-storage', '@capacitor/preferences', 'expo-sqlite', 'react-native-sqlite-storage', 'realm',
  '@nozbe/watermelondb',
];

const LLM_DEPS = [
  'openai', '@anthropic-ai/sdk', 'ai', '@ai-sdk/', 'langchain', '@langchain/', 'llamaindex', '@google/generative-ai',
  '@google/genai', '@mistralai/mistralai', 'cohere-ai', 'groq-sdk', '@huggingface/inference', 'ollama',
  '@aws-sdk/client-bedrock-runtime',
];
const SELF_HOSTED_LLM_DEPS = ['ollama', '@xenova/transformers', '@huggingface/transformers', 'node-llama-cpp'];
const VECTOR_DEPS = [
  '@pinecone-database/pinecone', 'chromadb', '@qdrant/js-client-rest', 'weaviate-client', 'weaviate-ts-client',
  'pgvector', '@zilliz/milvus2-sdk-node', '@lancedb/lancedb',
];

// Python (PyPI) packages, stored with a "py:" prefix so they never collide with npm names.
const py = (...names: string[]) => names.map((n) => `py:${n}`);
const PY_WEB_FRAMEWORKS = py('django', 'flask', 'fastapi', 'starlette', 'sanic', 'aiohttp', 'tornado', 'pyramid', 'bottle', 'litestar', 'quart', 'falcon');
PLATFORM_DEPS.backend.push(...PY_WEB_FRAMEWORKS);
// Django and Flask render HTML templates, so they also serve a web frontend; FastAPI etc. are API-only.
PLATFORM_DEPS.web.push(...py('django', 'flask'));
API_SERVER_DEPS.push(...PY_WEB_FRAMEWORKS);
AUTH_METHOD_DEPS.email_password!.push(...py('passlib', 'bcrypt', 'argon2-cffi', 'flask-login', 'django-allauth', 'fastapi-users'));
AUTH_METHOD_DEPS.oauth!.push(...py('authlib', 'django-allauth', 'social-auth-app-django', 'flask-dance', 'requests-oauthlib', 'mozilla-django-oidc'));
AUTH_METHOD_DEPS.passkey!.push(...py('webauthn', 'fido2'));
AUTH_METHOD_DEPS.otp_sms!.push(...py('twilio'));
AUTH_GENERIC_DEPS.push(...py('pyjwt', 'python-jose', 'djangorestframework-simplejwt', 'flask-jwt-extended', 'django-otp', 'pyotp'));
Object.assign(SESSION_DEPS, {
  'py:django': { kind: 'server_session', transport: 'cookie' },
  'py:flask-login': { kind: 'server_session', transport: 'cookie' },
  'py:flask-session': { kind: 'server_session', transport: 'cookie' },
  'py:djangorestframework-simplejwt': { kind: 'jwt', transport: 'authorization_header' },
  'py:flask-jwt-extended': { kind: 'jwt' },
  'py:pyjwt': { kind: 'jwt' },
  'py:python-jose': { kind: 'jwt' },
});
API_STYLE_DEPS.graphql!.push(...py('graphene', 'graphene-django', 'strawberry-graphql', 'ariadne'));
API_STYLE_DEPS.websocket!.push(...py('channels', 'websockets', 'python-socketio', 'flask-socketio'));
API_STYLE_DEPS.grpc!.push(...py('grpcio'));
DB_ENGINE_DEPS.postgres!.push(...py('psycopg2', 'psycopg2-binary', 'psycopg', 'asyncpg'));
DB_ENGINE_DEPS.mysql!.push(...py('mysqlclient', 'pymysql', 'aiomysql', 'mysql-connector-python'));
DB_ENGINE_DEPS.mssql!.push(...py('pymssql'));
DB_ENGINE_DEPS.oracle!.push(...py('oracledb', 'cx-oracle'));
DB_ENGINE_DEPS.mongodb!.push(...py('pymongo', 'motor', 'mongoengine', 'beanie'));
DB_ENGINE_DEPS.dynamodb!.push(...py('pynamodb'));
DB_ENGINE_DEPS.firestore!.push(...py('google-cloud-firestore'));
DB_ENGINE_DEPS.redis!.push(...py('redis'));
SQL_ORM_DEPS.push(...py('django', 'sqlalchemy', 'sqlmodel', 'peewee', 'tortoise-orm'));
UPLOAD_DEPS.push(...py('python-multipart', 'django-storages', 'flask-uploads', 'flask-reuploaded'));
IMAGE_DEPS.push(...py('pillow'));
OBJECT_STORAGE_DEPS.push(...py('boto3', 'django-storages', 'google-cloud-storage', 'azure-storage-blob', 'cloudinary', 'minio'));
PAYMENT_PROVIDER_DEPS.stripe!.push(...py('stripe'));
PAYMENT_PROVIDER_DEPS.paypal!.push(...py('paypal-server-sdk', 'paypalrestsdk', 'paypal-checkout-serversdk'));
PAYMENT_PROVIDER_DEPS.braintree!.push(...py('braintree'));
PAYMENT_PROVIDER_DEPS.adyen!.push(...py('adyen'));
PAYMENT_PROVIDER_DEPS.razorpay!.push(...py('razorpay'));
PAYMENT_PROVIDER_DEPS.square!.push(...py('squareup'));
SECRET_STORE_DEPS.push(...py('hvac', 'google-cloud-secret-manager', 'azure-keyvault-secrets', 'infisical-python'));
ENV_DEPS.push(...py('python-dotenv', 'django-environ', 'environs', 'python-decouple', 'pydantic-settings'));
LOGGER_DEPS.push(...py('structlog', 'loguru', 'python-json-logger'));
LOG_SERVICE_DEPS.push(...py('sentry-sdk', 'ddtrace', 'opentelemetry-sdk', 'newrelic', 'logtail-python'));
LLM_DEPS.push(...py('openai', 'anthropic', 'langchain', 'langchain-core', 'langchain-openai', 'llama-index', 'llama-index-core', 'google-generativeai', 'google-genai', 'mistralai', 'cohere', 'groq', 'litellm', 'ollama'));
SELF_HOSTED_LLM_DEPS.push(...py('ollama', 'transformers', 'vllm', 'llama-cpp-python'));
VECTOR_DEPS.push(...py('pinecone', 'pinecone-client', 'chromadb', 'qdrant-client', 'weaviate-client', 'pgvector', 'faiss-cpu', 'lancedb', 'pymilvus'));

// Native mobile packages: Maven (mvn:group:artifact), CocoaPods (pod:), Swift Package Manager (spm:), Flutter (pub:).
const mvn = (...names: string[]) => names.map((n) => `mvn:${n}`);
const pod = (...names: string[]) => names.map((n) => `pod:${n.toLowerCase()}`);
const spm = (...names: string[]) => names.map((n) => `spm:${n.toLowerCase()}`);
const pub = (...names: string[]) => names.map((n) => `pub:${n}`);
AUTH_METHOD_DEPS.oauth!.push(
  ...mvn('net.openid:appauth', 'com.google.android.gms:play-services-auth', 'com.auth0.android:auth0'),
  ...pod('AppAuth', 'GoogleSignIn', 'Auth0'),
  ...spm('appauth-ios', 'googlesignin-ios', 'auth0.swift'),
  ...pub('google_sign_in', 'flutter_appauth'),
);
AUTH_METHOD_DEPS.passkey!.push(...mvn('androidx.credentials:credentials'));
AUTH_GENERIC_DEPS.push(...mvn('com.google.firebase:firebase-auth', 'com.google.firebase:firebase-auth-ktx'), ...pod('FirebaseAuth'), ...pub('firebase_auth'));
MOBILE_STORAGE_DEPS.push(
  ...mvn('androidx.room:room-runtime', 'androidx.datastore:datastore', 'androidx.datastore:datastore-preferences', 'net.zetetic:sqlcipher-android', 'net.zetetic:android-database-sqlcipher', 'com.google.crypto.tink:tink-android', 'androidx.security:security-crypto'),
  ...pod('KeychainAccess', 'RealmSwift', 'SQLCipher', 'GRDB.swift'),
  ...spm('keychainaccess', 'keychain-swift', 'realm-swift', 'grdb.swift'),
  ...pub('flutter_secure_storage', 'shared_preferences', 'sqflite', 'hive'),
);
PAYMENT_PROVIDER_DEPS.stripe!.push(...mvn('com.stripe:stripe-android'), ...pod('Stripe', 'StripePaymentSheet'), ...spm('stripe-ios'), ...pub('flutter_stripe'));
IAP_DEPS.push(
  ...mvn('com.android.billingclient:billing', 'com.android.billingclient:billing-ktx', 'com.revenuecat.purchases:purchases'),
  ...pod('RevenueCat'),
  ...spm('purchases-ios'),
  ...pub('in_app_purchase', 'purchases_flutter'),
);
LLM_DEPS.push(
  ...mvn('com.google.ai.client.generativeai:generativeai', 'com.google.firebase:firebase-ai', 'com.google.firebase:firebase-vertexai', 'com.aallam.openai:openai-client'),
  ...spm('generative-ai-swift', 'openai'),
  ...pub('google_generative_ai', 'dart_openai', 'firebase_ai'),
);
const WEBVIEW_DEPS = ['react-native-webview', ...mvn('androidx.webkit:webkit'), ...pub('webview_flutter', 'flutter_inappwebview')];
const BIOMETRIC_DEPS = [
  'react-native-biometrics', 'expo-local-authentication',
  ...mvn('androidx.biometric:biometric', 'androidx.biometric:biometric-ktx'),
  ...pub('local_auth'),
];

// JVM backends (Spring Boot, Micronaut, Quarkus, Ktor) from Maven and Gradle, and Dart servers from pub.
const SPRING_WEB = mvn('org.springframework.boot:spring-boot-starter-web', 'org.springframework.boot:spring-boot-starter-webflux', 'org.springframework:spring-webmvc');
const JVM_SERVERS = [
  ...SPRING_WEB,
  ...mvn('io.micronaut:micronaut-http-server-netty', 'io.quarkus:quarkus-rest', 'io.quarkus:quarkus-resteasy', 'io.quarkus:quarkus-resteasy-reactive', 'io.ktor:ktor-server-core', 'io.ktor:ktor-server-core-jvm', 'io.javalin:javalin', 'io.vertx:vertx-web'),
  ...pub('shelf', 'dart_frog'),
];
PLATFORM_DEPS.backend.push(...JVM_SERVERS);
API_SERVER_DEPS.push(...JVM_SERVERS);
// Server-rendered HTML templates also make the app a web frontend.
PLATFORM_DEPS.web.push(...mvn('org.springframework.boot:spring-boot-starter-thymeleaf', 'org.springframework.boot:spring-boot-starter-freemarker', 'org.springframework.boot:spring-boot-starter-mustache', 'org.thymeleaf:thymeleaf', 'org.apache.tomcat.embed:tomcat-embed-jasper'));
AUTH_METHOD_DEPS.oauth!.push(...mvn('org.springframework.boot:spring-boot-starter-oauth2-client', 'org.springframework.security:spring-security-oauth2-client'));
AUTH_METHOD_DEPS.passkey!.push(...mvn('com.yubico:webauthn-server-core', 'org.springframework.security:spring-security-webauthn'));
AUTH_GENERIC_DEPS.push(...mvn(
  'org.springframework.boot:spring-boot-starter-security', 'org.springframework.boot:spring-boot-starter-oauth2-resource-server',
  'io.jsonwebtoken:jjwt-api', 'io.jsonwebtoken:jjwt', 'com.auth0:java-jwt', 'com.nimbusds:nimbus-jose-jwt',
));
Object.assign(SESSION_DEPS, {
  'mvn:org.springframework.session:spring-session-core': { kind: 'server_session', transport: 'cookie' },
  'mvn:org.springframework.session:spring-session-data-redis': { kind: 'server_session', transport: 'cookie' },
  'mvn:org.springframework.session:spring-session-jdbc': { kind: 'server_session', transport: 'cookie' },
  'mvn:org.springframework.boot:spring-boot-starter-oauth2-resource-server': { kind: 'jwt', transport: 'authorization_header' },
  'mvn:io.jsonwebtoken:jjwt-api': { kind: 'jwt' },
  'mvn:io.jsonwebtoken:jjwt': { kind: 'jwt' },
  'mvn:com.auth0:java-jwt': { kind: 'jwt' },
  'mvn:com.nimbusds:nimbus-jose-jwt': { kind: 'jwt' },
});
API_STYLE_DEPS.graphql!.push(...mvn('org.springframework.boot:spring-boot-starter-graphql', 'com.graphql-java:graphql-java', 'com.netflix.graphql.dgs:graphql-dgs-spring-boot-starter'));
API_STYLE_DEPS.websocket!.push(...mvn('org.springframework.boot:spring-boot-starter-websocket'));
API_STYLE_DEPS.grpc!.push(...mvn('io.grpc:grpc-stub', 'io.grpc:grpc-netty-shaded', 'net.devh:grpc-server-spring-boot-starter'));
DB_ENGINE_DEPS.postgres!.push(...mvn('org.postgresql:postgresql', 'org.postgresql:r2dbc-postgresql'), ...pub('postgres'));
DB_ENGINE_DEPS.mysql!.push(...mvn('com.mysql:mysql-connector-j', 'mysql:mysql-connector-java', 'org.mariadb.jdbc:mariadb-java-client'), ...pub('mysql1', 'mysql_client'));
DB_ENGINE_DEPS.mssql!.push(...mvn('com.microsoft.sqlserver:mssql-jdbc'));
DB_ENGINE_DEPS.oracle!.push(...mvn('com.oracle.database.jdbc:ojdbc11', 'com.oracle.database.jdbc:ojdbc8'));
DB_ENGINE_DEPS.mongodb!.push(...mvn('org.springframework.boot:spring-boot-starter-data-mongodb', 'org.mongodb:mongodb-driver-sync', 'org.mongodb:mongodb-driver-kotlin-coroutine'), ...pub('mongo_dart'));
DB_ENGINE_DEPS.dynamodb!.push(...mvn('software.amazon.awssdk:dynamodb', 'software.amazon.awssdk:dynamodb-enhanced'));
DB_ENGINE_DEPS.firestore!.push(...mvn('com.google.cloud:google-cloud-firestore'));
DB_ENGINE_DEPS.redis!.push(...mvn('org.springframework.boot:spring-boot-starter-data-redis', 'redis.clients:jedis', 'io.lettuce:lettuce-core'));
SQL_ORM_DEPS.push(...mvn(
  'org.springframework.boot:spring-boot-starter-data-jpa', 'org.springframework.boot:spring-boot-starter-jdbc', 'org.springframework.boot:spring-boot-starter-data-jdbc',
  'org.hibernate.orm:hibernate-core', 'org.jooq:jooq', 'org.mybatis.spring.boot:mybatis-spring-boot-starter', 'org.jetbrains.exposed:exposed-core', 'com.h2database:h2',
));
UPLOAD_DEPS.push(...mvn('commons-fileupload:commons-fileupload', 'org.apache.commons:commons-fileupload2-jakarta-servlet6'));
IMAGE_DEPS.push(...mvn('net.coobird:thumbnailator', 'org.imgscalr:imgscalr-lib'));
OBJECT_STORAGE_DEPS.push(...mvn('software.amazon.awssdk:s3', 'com.amazonaws:aws-java-sdk-s3', 'io.awspring.cloud:spring-cloud-aws-starter-s3', 'com.google.cloud:google-cloud-storage', 'com.azure:azure-storage-blob', 'io.minio:minio'));
PAYMENT_PROVIDER_DEPS.stripe!.push(...mvn('com.stripe:stripe-java'));
PAYMENT_PROVIDER_DEPS.paypal!.push(...mvn('com.paypal.sdk:paypal-server-sdk', 'com.paypal.sdk:checkout-sdk'));
PAYMENT_PROVIDER_DEPS.braintree!.push(...mvn('com.braintreepayments.gateway:braintree-java'));
PAYMENT_PROVIDER_DEPS.adyen!.push(...mvn('com.adyen:adyen-java-api-library'));
PAYMENT_PROVIDER_DEPS.razorpay!.push(...mvn('com.razorpay:razorpay-java'));
PAYMENT_PROVIDER_DEPS.square!.push(...mvn('com.squareup:square'));
SECRET_STORE_DEPS.push(...mvn(
  'software.amazon.awssdk:secretsmanager', 'io.awspring.cloud:spring-cloud-aws-starter-secrets-manager', 'com.google.cloud:google-cloud-secretmanager',
  'com.azure:azure-security-keyvault-secrets', 'org.springframework.cloud:spring-cloud-starter-vault-config',
));
LOGGER_DEPS.push(...mvn('org.slf4j:slf4j-api', 'ch.qos.logback:logback-classic', 'org.apache.logging.log4j:log4j-core', 'org.springframework.boot:spring-boot-starter-log4j2', 'io.github.oshai:kotlin-logging-jvm'));
LOG_SERVICE_DEPS.push(...mvn('io.sentry:sentry-spring-boot-starter-jakarta', 'io.sentry:sentry-spring-boot-starter', 'com.datadoghq:dd-trace-api', 'io.opentelemetry:opentelemetry-api', 'com.newrelic.agent.java:newrelic-api'));
LLM_DEPS.push(...mvn(
  'dev.langchain4j:langchain4j', 'dev.langchain4j:langchain4j-open-ai', 'dev.langchain4j:langchain4j-anthropic', 'org.springframework.ai:spring-ai-openai-spring-boot-starter',
  'org.springframework.ai:spring-ai-starter-model-openai', 'org.springframework.ai:spring-ai-starter-model-anthropic', 'com.openai:openai-java', 'com.anthropic:anthropic-java', 'com.google.genai:google-genai',
));
SELF_HOSTED_LLM_DEPS.push(...mvn('dev.langchain4j:langchain4j-ollama', 'org.springframework.ai:spring-ai-starter-model-ollama'));
VECTOR_DEPS.push(...mvn('io.pinecone:pinecone-client', 'io.qdrant:client', 'org.springframework.ai:spring-ai-starter-vector-store-pgvector', 'dev.langchain4j:langchain4j-pgvector'));

/** Dependencies from Maven, Gradle builds and version catalogs, Podfile, SwiftPM and pubspec.yaml. */
function nativeDeps(src: FileSource, dir: string): string[] {
  const names = new Set<string>();
  for (const f of ['build.gradle', 'build.gradle.kts', 'app/build.gradle', 'app/build.gradle.kts']) {
    const text = src.read(pj(dir, f)) ?? '';
    for (const m of text.matchAll(/\b(?:implementation|api|ksp|kapt|compileOnly|runtimeOnly)\s*\(?\s*["']([\w.-]+):([\w.-]+)(?::[^"']*)?["']/g)) {
      names.add(`mvn:${m[1]}:${m[2]}`);
    }
  }
  const pom = src.read(pj(dir, 'pom.xml')) ?? '';
  for (const dep of pom.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const group = dep[1]!.match(/<groupId>\s*([\w.-]+)\s*<\/groupId>/)?.[1];
    const artifact = dep[1]!.match(/<artifactId>\s*([\w.-]+)\s*<\/artifactId>/)?.[1];
    if (group && artifact) names.add(`mvn:${group}:${artifact}`);
  }
  const catalog = src.read(pj(dir, 'gradle', 'libs.versions.toml')) ?? '';
  for (const m of catalog.matchAll(/module\s*=\s*"([\w.-]+):([\w.-]+)"/g)) names.add(`mvn:${m[1]}:${m[2]}`);
  for (const m of catalog.matchAll(/group\s*=\s*"([\w.-]+)"\s*,\s*name\s*=\s*"([\w.-]+)"/g)) names.add(`mvn:${m[1]}:${m[2]}`);

  const podfile = src.read(pj(dir, 'Podfile')) ?? '';
  for (const m of podfile.matchAll(/^\s*pod\s+['"]([\w.+-]+)/gm)) names.add(`pod:${m[1]!.toLowerCase()}`);
  const swiftPkg = src.read(pj(dir, 'Package.swift')) ?? '';
  for (const m of swiftPkg.matchAll(/\.package\(\s*url:\s*"[^"]*\/([\w.-]+?)(?:\.git)?"/g)) names.add(`spm:${m[1]!.toLowerCase()}`);
  for (const resolved of swiftPackageResolved(src, dir)) {
    try {
      const json = JSON.parse(resolved) as { pins?: { identity?: string }[]; object?: { pins?: { package?: string; repositoryURL?: string }[] } };
      for (const pin of json.pins ?? []) if (pin.identity) names.add(`spm:${pin.identity.toLowerCase()}`);
      for (const pin of json.object?.pins ?? []) {
        const id = pin.repositoryURL?.match(/\/([\w.-]+?)(?:\.git)?$/)?.[1] ?? pin.package;
        if (id) names.add(`spm:${id.toLowerCase()}`);
      }
    } catch {
      // ignore malformed lockfiles
    }
  }

  const pubspec = src.read(pj(dir, 'pubspec.yaml')) ?? '';
  const deps = pubspec.match(/^dependencies:\s*\n((?:[ \t]+.*\n?|\s*\n)*)/m)?.[1] ?? '';
  for (const m of deps.matchAll(/^[ \t]{2}([a-z0-9_]+)\s*:/gm)) names.add(`pub:${m[1]}`);
  return [...names];
}

/** Package.resolved files at the root, in Xcode projects and in workspaces. */
function swiftPackageResolved(src: FileSource, dir: string): string[] {
  const paths = [pj(dir, 'Package.resolved')];
  for (const entry of src.list(dir).map((e) => e.replace(/\/$/, ''))) {
    if (entry.endsWith('.xcodeproj')) paths.push(pj(dir, entry, 'project.xcworkspace', 'xcshareddata', 'swiftpm', 'Package.resolved'));
    if (entry.endsWith('.xcworkspace')) paths.push(pj(dir, entry, 'xcshareddata', 'swiftpm', 'Package.resolved'));
  }
  return paths.map((p) => src.read(p)).filter((t): t is string => t !== undefined);
}

const WALK_SKIP = new Set(['node_modules', '.git', 'build', 'dist', 'Pods', '.gradle', 'DerivedData', '.dart_tool', 'vendor', '.venv']);
const MAX_WALK_FILES = 5000;

/** Bounded walk for native sources and manifests (mobile options are found in code and config). */
function walkFiles(src: FileSource, match: RegExp): string[] {
  const out: string[] = [];
  let seen = 0;
  const walk = (dir: string) => {
    for (const e of src.list(dir)) {
      if (seen >= MAX_WALK_FILES) return;
      if (e.endsWith('/')) {
        const name = e.slice(0, -1);
        if (!WALK_SKIP.has(name) && !name.startsWith('.')) walk(pj(dir, name));
      } else {
        seen++;
        if (match.test(e)) out.push(pj(dir, e));
      }
    }
  };
  walk('');
  return out;
}

/** WebView, biometric and deep-link usage from native sources and manifests. */
function mobileFeatures(src: FileSource): { webviews: string[]; biometrics: string[]; deepLinks: string[] } {
  const result = { webviews: [] as string[], biometrics: [] as string[], deepLinks: [] as string[] };
  for (const path of walkFiles(src, /\.(kt|java|swift)$|^(AndroidManifest\.xml|Info\.plist|app\.json|app\.config\.json)$|\.entitlements$/)) {
    const text = src.read(path) ?? '';
    const rel = path;
    const name = base(path);
    if (/\.(kt|java|swift)$/.test(name)) {
      if (/\b(WebView|WKWebView)\b/.test(text)) result.webviews.push(rel);
      if (/\b(BiometricPrompt|LAContext)\b/.test(text)) result.biometrics.push(rel);
    } else if (name === 'AndroidManifest.xml') {
      if (/<intent-filter[\s\S]*?<data\s[^>]*android:(scheme|host)\s*=/.test(text)) result.deepLinks.push(`${rel} (intent-filter)`);
    } else if (name === 'Info.plist') {
      if (/<key>CFBundleURLTypes<\/key>/.test(text)) result.deepLinks.push(`${rel} (CFBundleURLTypes)`);
    } else if (name.endsWith('.entitlements')) {
      if (/com\.apple\.developer\.associated-domains/.test(text)) result.deepLinks.push(`${rel} (associated domains)`);
    } else if (/"scheme"\s*:/.test(text)) {
      result.deepLinks.push(`${rel} (Expo scheme)`);
    }
  }
  return result;
}

/** PEP 503 normalized name. */
const pyName = (raw: string) => raw.trim().toLowerCase().replace(/[-_.]+/g, '-');

/** Dependencies from requirements*.txt, pyproject.toml (PEP 621/735, Poetry) and Pipfile. */
function pythonDeps(src: FileSource, dir: string): string[] {
  const names: string[] = [];
  const addSpec = (spec: string) => {
    const m = spec.trim().match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/);
    if (m) names.push(pyName(m[1]!));
  };
  const files = src.list(dir).filter((f) => /^requirements.*\.(txt|in)$/i.test(f));
  for (const f of files) {
    for (const line of (src.read(pj(dir, f)) ?? '').split(/\r?\n/)) {
      const l = line.split('#')[0]!.trim();
      if (l && !l.startsWith('-')) addSpec(l);
    }
  }

  // Split TOML-like files into [sections]; only dependency sections are read, so arrays such as
  // keywords = ["django"] never count as dependencies.
  const sections = (text: string) =>
    text.split(/^\[/m).map((chunk) => {
      const end = chunk.indexOf(']');
      return { name: end === -1 ? '' : chunk.slice(0, end).trim().replace(/^\[|\]$/g, ''), body: end === -1 ? chunk : chunk.slice(end + 1) };
    });
  const quoted = (text: string) => [...text.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]!);
  // Contents of every `key = [ ... ]` array, ignoring brackets inside quotes (e.g. "sqlalchemy[asyncio]").
  const arrays = (body: string, key?: string): string[] => {
    const out: string[] = [];
    const re = key ? new RegExp(`^\\s*${key}\\s*=\\s*\\[`, 'gm') : /=\s*\[/g;
    for (const m of body.matchAll(re)) {
      let depth = 1;
      let quote = '';
      let i = m.index! + m[0].length;
      const start = i;
      for (; i < body.length && depth > 0; i++) {
        const ch = body[i]!;
        if (quote) {
          if (ch === quote) quote = '';
        } else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '[') depth++;
        else if (ch === ']') depth--;
      }
      out.push(body.slice(start, i - 1));
    }
    return out;
  };
  const keys = (body: string) => [...body.matchAll(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=/gm)].map((m) => m[1]!);

  for (const { name, body } of sections(src.read(pj(dir, 'pyproject.toml')) ?? '')) {
    if (name === 'project') {
      arrays(body, 'dependencies').forEach((arr) => quoted(arr).forEach(addSpec));
    } else if (name === 'project.optional-dependencies' || name === 'dependency-groups') {
      arrays(body).forEach((arr) => quoted(arr).forEach(addSpec));
    } else if (/^tool\.poetry(\.group\.[\w-]+)?\.(dev-)?dependencies$/.test(name)) {
      keys(body).filter((k) => k !== 'python').forEach(addSpec);
    }
  }
  for (const { name, body } of sections(src.read(pj(dir, 'Pipfile')) ?? '')) {
    if (name === 'packages' || name === 'dev-packages') keys(body).forEach(addSpec);
  }
  return names.map((n) => `py:${n}`);
}

// AWS: infrastructure code (Terraform, CloudFormation/SAM, Serverless, CDK) names the services in use.
// Each entry maps a resource-type prefix to a cloud component and the service option it turns on.
type AwsHit = [component: string, service?: string];
const TF_AWS: [string, ...AwsHit][] = [
  ['aws_instance', 'aws_compute', 'ec2'], ['aws_launch_template', 'aws_compute', 'ec2'], ['aws_launch_configuration', 'aws_compute', 'ec2'],
  ['aws_autoscaling_group', 'aws_compute', 'ec2'], ['aws_ami', 'aws_compute', 'ec2'],
  ['aws_ecs_', 'aws_compute', 'ecs'], ['aws_eks_', 'aws_compute', 'eks'], ['aws_lambda_', 'aws_compute', 'lambda'],
  ['aws_elastic_beanstalk_', 'aws_compute', 'elastic_beanstalk'], ['aws_apprunner_', 'aws_compute', 'app_runner'],
  ['aws_lightsail_', 'aws_compute', 'lightsail'], ['aws_batch_', 'aws_compute', 'batch'],
  ['aws_s3_', 'aws_storage', 's3'], ['aws_ebs_', 'aws_storage', 'ebs'], ['aws_volume_attachment', 'aws_storage', 'ebs'],
  ['aws_efs_', 'aws_storage', 'efs'], ['aws_fsx_', 'aws_storage', 'fsx'], ['aws_backup_', 'aws_storage', 'backup'],
  ['aws_db_instance', 'aws_database', 'rds'], ['aws_rds_cluster', 'aws_database', 'aurora'], ['aws_dynamodb_', 'aws_database', 'dynamodb'],
  ['aws_elasticache_', 'aws_database', 'elasticache'], ['aws_memorydb_', 'aws_database', 'memorydb'], ['aws_docdb_', 'aws_database', 'documentdb'],
  ['aws_neptune_', 'aws_database', 'neptune'], ['aws_keyspaces_', 'aws_database', 'keyspaces'], ['aws_timestreamwrite_', 'aws_database', 'timestream'],
  ['aws_workspaces_', 'aws_end_user', 'workspaces'], ['aws_appstream_', 'aws_end_user', 'appstream'],
];
const CFN_AWS: [string, ...AwsHit][] = [
  ['AWS::EC2::Instance', 'aws_compute', 'ec2'], ['AWS::EC2::LaunchTemplate', 'aws_compute', 'ec2'], ['AWS::AutoScaling::', 'aws_compute', 'ec2'],
  ['AWS::ECS::', 'aws_compute', 'ecs'], ['AWS::EKS::', 'aws_compute', 'eks'], ['AWS::Lambda::', 'aws_compute', 'lambda'],
  ['AWS::Serverless::Function', 'aws_compute', 'lambda'], ['AWS::ElasticBeanstalk::', 'aws_compute', 'elastic_beanstalk'],
  ['AWS::AppRunner::', 'aws_compute', 'app_runner'], ['AWS::Lightsail::', 'aws_compute', 'lightsail'], ['AWS::Batch::', 'aws_compute', 'batch'],
  ['AWS::S3::', 'aws_storage', 's3'], ['AWS::EC2::Volume', 'aws_storage', 'ebs'], ['AWS::EFS::', 'aws_storage', 'efs'],
  ['AWS::FSx::', 'aws_storage', 'fsx'], ['AWS::Backup::', 'aws_storage', 'backup'],
  ['AWS::RDS::DBInstance', 'aws_database', 'rds'], ['AWS::RDS::DBCluster', 'aws_database', 'aurora'], ['AWS::DynamoDB::', 'aws_database', 'dynamodb'],
  ['AWS::Serverless::SimpleTable', 'aws_database', 'dynamodb'], ['AWS::ElastiCache::', 'aws_database', 'elasticache'],
  ['AWS::MemoryDB::', 'aws_database', 'memorydb'], ['AWS::DocDB::', 'aws_database', 'documentdb'], ['AWS::Neptune::', 'aws_database', 'neptune'],
  ['AWS::Cassandra::', 'aws_database', 'keyspaces'], ['AWS::Timestream::', 'aws_database', 'timestream'],
  ['AWS::WorkSpaces::', 'aws_end_user', 'workspaces'], ['AWS::AppStream::', 'aws_end_user', 'appstream'],
];
// Resource types that put the app on the internet, and that show an AWS Organization or federated sign-in.
const TF_PUBLIC = /^aws_(lb|alb|elb|api_gateway_|apigatewayv2_|cloudfront_distribution|lambda_function_url|apprunner_service|elastic_beanstalk_environment|lightsail_instance)/;
const CFN_PUBLIC = /^AWS::(ElasticLoadBalancing|ElasticLoadBalancingV2|ApiGateway|ApiGatewayV2|CloudFront|AppRunner::Service|Serverless::(Api|HttpApi)|Lambda::Url)/;
const TF_ORG = /^aws_organizations_/;
const CFN_ORG = /^AWS::Organizations::/;
const TF_FEDERATED = /^aws_(ssoadmin_|identitystore_|iam_saml_provider|iam_openid_connect_provider)/;
const CFN_FEDERATED = /^AWS::(SSO::|IAM::SAMLProvider|IAM::OIDCProvider)/;
// Packages that show the app runs on or talks to AWS.
const AWS_SDK_DEPS: [string, ...AwsHit][] = [
  ['@aws-sdk/client-s3', 'aws_storage', 's3'], ['@aws-sdk/lib-storage', 'aws_storage', 's3'], ['@aws-sdk/s3-request-presigner', 'aws_storage', 's3'],
  ['py:boto3', 'aws_account'], ['py:aws-cdk-lib', 'aws_account'], ['aws-cdk-lib', 'aws_account'], ['aws-cdk', 'aws_account'], ['@aws-sdk/', 'aws_account'],
  ['aws-sdk', 'aws_account'], ['mvn:software.amazon.awssdk:s3', 'aws_storage', 's3'], ['mvn:software.amazon.awssdk:', 'aws_account'],
  ['@aws-sdk/client-dynamodb', 'aws_database', 'dynamodb'], ['@aws-sdk/lib-dynamodb', 'aws_database', 'dynamodb'], ['py:pynamodb', 'aws_database', 'dynamodb'],
  ['mvn:software.amazon.awssdk:dynamodb', 'aws_database', 'dynamodb'], ['@aws-sdk/rds-signer', 'aws_database', 'rds'],
  ['serverless', 'aws_compute', 'lambda'], ['serverless-http', 'aws_compute', 'lambda'], ['@vendia/serverless-express', 'aws_compute', 'lambda'],
  ['@codegenie/serverless-express', 'aws_compute', 'lambda'], ['@aws-lambda-powertools/', 'aws_compute', 'lambda'], ['@types/aws-lambda', 'aws_compute', 'lambda'],
  ['py:aws-lambda-powertools', 'aws_compute', 'lambda'], ['py:mangum', 'aws_compute', 'lambda'], ['py:chalice', 'aws_compute', 'lambda'], ['py:zappa', 'aws_compute', 'lambda'],
  ['mvn:com.amazonaws:aws-lambda-java-core', 'aws_compute', 'lambda'], ['mvn:com.amazonaws:aws-lambda-java-events', 'aws_compute', 'lambda'],
];
// Packages that mean the app is deployed to AWS (not just calling an AWS API from somewhere else).
const AWS_DEPLOY_DEPS = [
  'aws-cdk-lib', 'aws-cdk', 'py:aws-cdk-lib', 'serverless', 'serverless-http', '@vendia/serverless-express', '@codegenie/serverless-express',
  '@aws-lambda-powertools/', '@types/aws-lambda', 'py:aws-lambda-powertools', 'py:mangum', 'py:chalice', 'py:zappa',
  'mvn:com.amazonaws:aws-lambda-java-core', 'mvn:com.amazonaws:aws-lambda-java-events',
];
const IAC_DIRS = /^(infra|infrastructure|terraform|tf|iac|deploy|deployment|deployments|cdk|cloudformation|cfn|stacks|templates|environments|envs|modules|aws|cloud|ops|devops)$/i;
const CFN_FILE = /(^|[-_.])(template|stack|cloudformation|cfn|sam)([-_.]|$)|^serverless\.ya?ml$/i;
const MAX_IAC_FILES = 300;

/** Directories that may hold infrastructure code: project dirs plus up to two levels inside IaC folders. */
function iacDirs(src: FileSource, dirs: string[]): string[] {
  const out = new Set(dirs);
  let frontier = dirs.filter((d) => IAC_DIRS.test(base(d)));
  for (let depth = 0; depth < 3 && frontier.length > 0; depth++) {
    frontier = frontier.flatMap((d) => subdirs(src, d)).filter((d) => !out.has(d));
    frontier.forEach((d) => out.add(d));
  }
  return [...out];
}

interface AwsFindings {
  hits: Map<string, { services: Set<string>; evidence: Set<string> }>;
  publicEndpoint: string[];
  organization: string[];
  federated: string[];
}

function awsFromIac(src: FileSource, dirs: string[]): AwsFindings {
  const f: AwsFindings = { hits: new Map(), publicEndpoint: [], organization: [], federated: [] };
  const add = (component: string, service: string | undefined, evidence: string) => {
    const e = f.hits.get(component) ?? { services: new Set(), evidence: new Set() };
    if (service) e.services.add(service);
    e.evidence.add(evidence);
    f.hits.set(component, e);
  };
  const match = (table: [string, ...AwsHit][], type: string, file: string) => {
    const hit = table.find(([prefix]) => type.startsWith(prefix));
    add('aws_account', undefined, file);
    if (hit) add(hit[1], hit[2], `${file} (${hit[0].replace(/[_:]+$/, '')})`);
  };
  let read = 0;
  for (const dir of iacDirs(src, dirs)) {
    for (const entry of src.list(dir)) {
      if (entry.endsWith('/') || read >= MAX_IAC_FILES) continue;
      const path = pj(dir, entry);
      if (/\.tf$/.test(entry)) {
        const text = src.read(path);
        read++;
        if (!text) continue;
        if (/provider\s+"aws"/.test(text)) add('aws_account', undefined, path);
        for (const m of text.matchAll(/^\s*resource\s+"(aws_[a-z0-9_]+)"/gm)) {
          const type = m[1]!;
          match(TF_AWS, type, path);
          if (TF_PUBLIC.test(type)) f.publicEndpoint.push(`${path} (${type})`);
          if (TF_ORG.test(type)) f.organization.push(`${path} (${type})`);
          if (TF_FEDERATED.test(type)) f.federated.push(`${path} (${type})`);
        }
      } else if (/\.(ya?ml|json|template)$/i.test(entry) && (CFN_FILE.test(entry) || IAC_DIRS.test(base(dir)))) {
        const text = src.read(path);
        read++;
        if (!text) continue;
        const serverless = /^serverless\.ya?ml$/i.test(entry) && /^provider:/m.test(text) && /^\s+name:\s*aws\b/m.test(text);
        if (serverless) {
          add('aws_compute', 'lambda', `${path} (Serverless Framework)`);
          add('aws_account', undefined, path);
          if (/^\s+-\s*(http|httpApi|alb)\s*:/m.test(text)) f.publicEndpoint.push(`${path} (http events)`);
        }
        if (!serverless && !/AWSTemplateFormatVersion|["']?Type["']?\s*:\s*["']?AWS::/.test(text)) continue;
        for (const m of text.matchAll(/["']?Type["']?\s*:\s*["']?(AWS::[A-Za-z0-9]+::[A-Za-z0-9]+)/g)) {
          const type = m[1]!;
          match(CFN_AWS, type, path);
          if (CFN_PUBLIC.test(type)) f.publicEndpoint.push(`${path} (${type})`);
          if (CFN_ORG.test(type)) f.organization.push(`${path} (${type})`);
          if (CFN_FEDERATED.test(type)) f.federated.push(`${path} (${type})`);
        }
      } else if (entry === 'cdk.json') {
        add('aws_account', undefined, `${path} (AWS CDK)`);
      } else if (entry === 'Dockerrun.aws.json') {
        add('aws_compute', 'elastic_beanstalk', path);
        add('aws_account', undefined, path);
      }
    }
    if (exists(src, pj(dir, '.elasticbeanstalk/config.yml'))) {
      add('aws_compute', 'elastic_beanstalk', pj(dir, '.elasticbeanstalk/config.yml'));
      add('aws_account', undefined, pj(dir, '.elasticbeanstalk/config.yml'));
    }
  }
  return f;
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readJson(src: FileSource, path: string): PackageJson | undefined {
  const text = src.read(path);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as PackageJson;
  } catch {
    return undefined;
  }
}

function subdirs(src: FileSource, dir: string): string[] {
  return src
    .list(dir)
    .filter((e) => e.endsWith('/') && !e.startsWith('.') && e !== 'node_modules/')
    .map((e) => pj(dir, e.slice(0, -1)));
}

/** Project root plus one level of subfolders, plus common monorepo folders (apps/*, packages/*, services/*). */
function projectDirs(src: FileSource): string[] {
  const dirs = ['', ...subdirs(src, '')];
  for (const group of ['apps', 'packages', 'services']) dirs.push(...subdirs(src, group));
  return [...new Set(dirs)];
}

function hasAny(src: FileSource, dir: string, files: string[]): string | undefined {
  return files.find((f) => exists(src, pj(dir, f)));
}

function hasXcodeProject(src: FileSource, dir: string): boolean {
  return src.list(dir).some((f) => /\.(xcodeproj|xcworkspace)\/?$/.test(f));
}

/**
 * Detect platforms and components. `rootName` is the folder name, used as the app name when no package
 * metadata names it.
 */
export function detect(src: FileSource, rootName = 'app'): Detection {
  const root = '';
  const dirs = projectDirs(src);
  const deps = new Set<string>();
  const rootPkg = readJson(src, 'package.json');
  for (const dir of dirs) {
    const pkg = dir === root ? rootPkg : readJson(src, pj(dir, 'package.json'));
    for (const name of Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies })) deps.add(name);
    for (const name of pythonDeps(src, dir)) deps.add(name);
    for (const name of nativeDeps(src, dir)) deps.add(name);
  }

  // Actual package names that match the candidates (a scope prefix expands to every matching package).
  const found = (candidates: string[]) => [
    ...new Set(candidates.flatMap((c) => (c.endsWith('/') ? [...deps].filter((d) => d.startsWith(c)) : deps.has(c) ? [c] : []))),
  ];

  // Platforms
  const platformEvidence: Partial<Record<Platform, string[]>> = {};
  const addPlatform = (p: Platform, evidence: string[]) => {
    if (evidence.length > 0) (platformEvidence[p] ??= []).push(...evidence);
  };
  for (const [p, list] of Object.entries(PLATFORM_DEPS) as [Platform, string[]][]) addPlatform(p, found(list));
  for (const dir of dirs) {
    const rel = dir === root ? '' : `${base(dir)}/`;
    // Gradle and SwiftPM alone are not enough: Spring Boot and Vapor backends use them too.
    const androidMarker =
      hasAny(src, dir, ['app/src/main/AndroidManifest.xml', 'src/main/AndroidManifest.xml']) ??
      (base(dir) === 'android' ? hasAny(src, dir, ['build.gradle', 'build.gradle.kts']) : undefined);
    if (androidMarker) addPlatform('android', [`${rel}${androidMarker}`]);
    if (hasAny(src, dir, ['Podfile']) || hasXcodeProject(src, dir)) addPlatform('ios', [`${rel || './'} (Xcode/CocoaPods)`]);
    if (/^\s*flutter\s*:/m.test(src.read(pj(dir, 'pubspec.yaml')) ?? '')) {
      addPlatform('android', [`${rel}pubspec.yaml (Flutter)`]);
      addPlatform('ios', [`${rel}pubspec.yaml (Flutter)`]);
    }
  }
  for (const p of Object.keys(platformEvidence) as Platform[]) platformEvidence[p] = [...new Set(platformEvidence[p])];
  const mobile = !!(platformEvidence.android || platformEvidence.ios);

  const platforms = (['web', 'backend', 'android', 'ios', 'cloud'] as Platform[]).filter((p) => platformEvidence[p]);
  const components: DetectedComponent[] = [];

  // Authentication
  const methods = Object.entries(AUTH_METHOD_DEPS).filter(([, list]) => found(list).length > 0);
  const authEvidence = [...methods.flatMap(([m, list]) => found(list).map((d) => `${d} → ${m}`)), ...found(AUTH_GENERIC_DEPS)];
  if (authEvidence.length > 0) {
    components.push({
      type: 'auth',
      options: methods.length > 0 ? { methods: methods.map(([m]) => m) } : {},
      evidence: authEvidence,
    });
  }

  // Sessions: options only when every matching library agrees.
  const sessionLibs = Object.keys(SESSION_DEPS).filter((d) => deps.has(d));
  if (sessionLibs.length > 0) {
    const options: Record<string, unknown> = {};
    for (const key of ['kind', 'transport'] as const) {
      const values = new Set(sessionLibs.map((d) => SESSION_DEPS[d]![key]).filter(Boolean));
      if (values.size === 1) options[key] = [...values][0];
    }
    components.push({ type: 'session', options, evidence: sessionLibs });
  }

  // Web frontend: any browser-facing app.
  if (platformEvidence.web) {
    components.push({ type: 'web_frontend', options: {}, evidence: platformEvidence.web });
  }

  // API
  const servers = found(API_SERVER_DEPS);
  const styles = Object.entries(API_STYLE_DEPS).filter(([, list]) => found(list).length > 0);
  if (servers.length > 0 || styles.length > 0 || platformEvidence.backend) {
    const style = [...(servers.length > 0 ? ['rest'] : []), ...styles.map(([s]) => s)];
    components.push({
      type: 'api',
      options: style.length > 0 ? { style } : {},
      evidence: [...servers, ...styles.flatMap(([, list]) => found(list))].concat(
        servers.length + styles.length === 0 ? platformEvidence.backend! : [],
      ),
    });
  }

  // Databases: one component per engine; redis only counts when it is the only store.
  const engines = new Map<string, string[]>();
  for (const [engine, list] of Object.entries(DB_ENGINE_DEPS)) {
    if (found(list).length > 0) engines.set(engine, found(list));
  }
  for (const dir of dirs) {
    const schema = src.read(pj(dir, 'prisma', 'schema.prisma'));
    const provider = schema?.match(/datasource\s+\w+\s*\{[^}]*provider\s*=\s*"(\w+)"/)?.[1];
    const engine = provider && PRISMA_PROVIDERS[provider];
    if (engine) engines.set(engine, [...(engines.get(engine) ?? []), `prisma provider "${provider}"`]);
  }
  if (engines.size > 1) engines.delete('redis');
  const orms = found(SQL_ORM_DEPS);
  if (engines.size === 0 && orms.length > 0) {
    components.push({ type: 'database', options: { kind: 'sql' }, evidence: orms });
  }
  for (const [engine, evidence] of engines) {
    components.push({
      type: 'database',
      ...(engines.size > 1 ? { name: engine } : {}),
      options: { engine, kind: ENGINE_KIND[engine] },
      evidence: [...evidence, ...(ENGINE_KIND[engine] === 'sql' ? orms : [])],
    });
  }

  // File upload
  const uploads = found(UPLOAD_DEPS);
  if (uploads.length > 0) {
    const options: Record<string, unknown> = {};
    const images = found(IMAGE_DEPS);
    const storage = found(OBJECT_STORAGE_DEPS);
    if (images.length > 0) options.types = ['images'];
    if (storage.length > 0) options.storage = 'object_storage';
    components.push({ type: 'file_upload', options, evidence: [...uploads, ...images, ...storage] });
  }

  // Payments
  const providers = Object.entries(PAYMENT_PROVIDER_DEPS).filter(([, list]) => found(list).length > 0);
  const iap = found(IAP_DEPS);
  if (providers.length > 0 || iap.length > 0) {
    components.push({
      type: 'payments',
      options: providers.length === 1 && iap.length === 0 ? { provider: providers[0]![0] } : {},
      evidence: [...providers.flatMap(([, list]) => found(list)), ...iap],
    });
  }

  // Secrets: any backend holds credentials; env files and secret stores are direct evidence.
  const secretStores = found(SECRET_STORE_DEPS);
  const envFiles = ['.env', '.env.local', '.env.production', '.env.example'].filter((f) => exists(src, f));
  const secretEvidence = [...secretStores, ...found(ENV_DEPS), ...envFiles];
  if (secretEvidence.length > 0 || platformEvidence.backend || mobile) {
    const options: Record<string, unknown> = {};
    if (secretStores.length > 0) options.storage = 'secrets_manager';
    else if (found(ENV_DEPS).length > 0 || envFiles.length > 0) options.storage = 'env_vars';
    const ci = ['.github/workflows', '.gitlab-ci.yml', 'bitbucket-pipelines.yml', '.circleci', 'azure-pipelines.yml', 'Jenkinsfile']
      .filter((f) => exists(src, f.replace(/\/$/, '')));
    if (ci.length > 0) options.ci_cd = true;
    components.push({
      type: 'secrets',
      options,
      evidence: secretEvidence.length > 0 ? [...secretEvidence, ...ci] : [platformEvidence.backend ? 'backend present' : 'mobile app present', ...ci],
    });
  }

  // Logging: every backend logs.
  const loggers = found(LOGGER_DEPS);
  const logServices = found(LOG_SERVICE_DEPS);
  if (loggers.length > 0 || logServices.length > 0 || platformEvidence.backend) {
    const logEvidence = [...loggers, ...logServices];
    components.push({
      type: 'logging',
      options: logServices.length > 0 ? { destination: 'log_service' } : {},
      evidence: logEvidence.length > 0 ? logEvidence : ['backend present'],
    });
  }

  // Mobile on-device data: any mobile app keeps at least tokens or caches.
  if (mobile) {
    const storageLibs = found(MOBILE_STORAGE_DEPS);
    components.push({ type: 'mobile_storage', options: {}, evidence: storageLibs.length > 0 ? storageLibs : ['mobile app present'] });

    // Mobile platform: options come from dependencies plus a bounded scan of native code and manifests.
    const features = mobileFeatures(src);
    const webviews = [...found(WEBVIEW_DEPS), ...features.webviews.slice(0, 3)];
    const biometrics = [...found(BIOMETRIC_DEPS), ...features.biometrics.slice(0, 3)];
    const deepLinks = features.deepLinks.slice(0, 3);
    components.push({
      type: 'mobile_platform',
      options: {
        ...(webviews.length > 0 ? { webviews: true } : {}),
        ...(biometrics.length > 0 ? { biometrics: true } : {}),
        ...(deepLinks.length > 0 ? { deep_links: true } : {}),
      },
      evidence: [
        ...(platformEvidence.android ?? []),
        ...(platformEvidence.ios ?? []),
        ...webviews.map((w) => `${w} → webviews`),
        ...biometrics.map((b) => `${b} → biometrics`),
        ...deepLinks.map((d) => `${d} → deep links`),
      ],
    });
  }

  // AI / LLM. Capabilities (chat, rag, tools) are not guessed: left unset, every AI control applies.
  const hosted = found(LLM_DEPS).filter((d) => !SELF_HOSTED_LLM_DEPS.includes(d));
  const selfHosted = found(SELF_HOSTED_LLM_DEPS);
  if (hosted.length > 0 || selfHosted.length > 0) {
    components.push({
      type: 'ai_feature',
      options: { provider: hosted.length > 0 ? 'hosted_api' : 'self_hosted' },
      evidence: [...hosted, ...selfHosted, ...found(VECTOR_DEPS)],
    });
  }

  // AWS cloud: infrastructure code first, then SDK and framework packages. SDK packages alone (an app
  // uploading to S3, say) do not make AWS a platform; they only fill in the services once it is one.
  const aws = awsFromIac(src, dirs);
  const onAws = aws.hits.size > 0 || found(AWS_DEPLOY_DEPS).length > 0;
  for (const [prefix, component, service] of onAws ? AWS_SDK_DEPS : []) {
    for (const dep of found([prefix])) {
      const e = aws.hits.get(component) ?? { services: new Set<string>(), evidence: new Set<string>() };
      if (service) e.services.add(service);
      e.evidence.add(dep);
      aws.hits.set(component, e);
      if (component !== 'aws_account') {
        const acc = aws.hits.get('aws_account') ?? { services: new Set<string>(), evidence: new Set<string>() };
        acc.evidence.add(dep);
        aws.hits.set('aws_account', acc);
      }
    }
  }
  if (onAws) {
    platformEvidence.cloud = [...new Set([...aws.hits.values()].flatMap((h) => [...h.evidence]))].slice(0, 5);
    platforms.push('cloud');
  }
  for (const type of ['aws_account', 'aws_compute', 'aws_storage', 'aws_database', 'aws_end_user']) {
    const hit = aws.hits.get(type);
    if (!hit) continue;
    const options: Record<string, unknown> = {};
    if (hit.services.size > 0) options.services = [...hit.services];
    if (type === 'aws_compute' && aws.publicEndpoint.length > 0) options.public_endpoint = true;
    if (type === 'aws_account' && aws.organization.length > 0) options.organization = true;
    if (type === 'aws_account' && aws.federated.length > 0) options.federated_identity = true;
    // Components with a services list need at least one service; without one, leave the component out.
    if (type !== 'aws_account' && hit.services.size === 0) continue;
    const extra = type === 'aws_compute' ? aws.publicEndpoint.slice(0, 3).map((e) => `${e} → public endpoint`) : type === 'aws_account' ? [...aws.organization, ...aws.federated].slice(0, 3) : [];
    components.push({ type, options, evidence: [...[...hit.evidence].slice(0, 8), ...extra] });
  }

  const name = rootPkg?.name?.replace(/^@[^/]+\//, '') || rootName;
  const label = (e: string) =>
    e
      .replace(/\bpy:([^\s,]+)/g, '$1 (PyPI)')
      .replace(/\bmvn:([^\s,]+)/g, '$1 (Maven)')
      .replace(/\bpod:([^\s,]+)/g, '$1 (CocoaPods)')
      .replace(/\bspm:([^\s,]+)/g, '$1 (SwiftPM)')
      .replace(/\bpub:([^\s,]+)/g, '$1 (pub)');
  for (const c of components) c.evidence = [...new Set(c.evidence.map(label))];
  for (const p of Object.keys(platformEvidence) as Platform[]) platformEvidence[p] = [...new Set(platformEvidence[p]!.map(label))];
  return { name, platforms, platformEvidence, components };
}
