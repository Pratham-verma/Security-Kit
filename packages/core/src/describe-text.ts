// "Describe it in your own words": turns a plain-language description of an app into the same Detection
// that detect() builds from project files, plus a suggested data sensitivity and security level. Keyword
// rules only — the text never leaves the caller — so the result is a starting point the user reviews.
import { type DetectedComponent, type Detection, ENGINE_KIND } from './detect.js';
import type { Platform } from './types.js';

export interface TextDetection {
  detection: Detection;
  data_sensitivity: 'low' | 'medium' | 'high';
  assurance_level: 1 | 2 | 3;
}

/** Longest description that is read; anything after it is ignored. */
export const MAX_DESCRIPTION_LENGTH = 10_000;

// A mention is ignored when one of these words comes shortly before it in the same clause ("no payments").
const NEGATION = /\b(no|not|without|never|don'?t|doesn'?t|won'?t|isn'?t|aren'?t|neither|nor|none)\b[^,;:]{0,30}$/i;

/** Every non-negated match of `re` in the text, as written by the user. */
function find(clauses: string[], re: RegExp): string[] {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  const out: string[] = [];
  for (const clause of clauses) {
    for (const m of clause.matchAll(g)) {
      if (!NEGATION.test(clause.slice(0, m.index))) out.push(m[0].trim());
    }
  }
  return out;
}

const W = (alternatives: string) => new RegExp(`\\b(?:${alternatives})\\b`, 'i');

const PLATFORM_WORDS: Record<Platform, RegExp> = {
  web: W('web ?apps?|web ?sites?|web portal|portal|browsers?|front[- ]?end|react(?! native)|next\\.?js|vue|nuxt|angular|svelte|landing pages?|dashboards?|single[- ]page|spa|django|rails|laravel|wordpress|php|html'),
  backend: W('back[- ]?end|servers?|apis?|rest(?:ful)?|graphql|grpc|websockets?|node(?:\\.?js)?|express|nest\\.?js|fastify|django|flask|fastapi|rails|laravel|spring(?: boot)?|php|asp\\.net|\\.net|golang|microservices?|databases?'),
  android: W('android|kotlin|play store|google play'),
  ios: W('ios|iphones?|ipads?|swift(?:ui)?|app store'),
  cloud: W('aws|amazon web services|ec2|lambda|s3|rds|aurora|dynamodb|ecs|fargate|eks|elastic beanstalk|app runner|lightsail|cloudfront|elasticache|workspaces|appstream'),
};
const CROSS_PLATFORM_MOBILE = W('mobile apps?|mobile application|phone apps?|flutter|react native|expo|ionic|capacitor|cross[- ]platform app');

const AUTH = W('log ?ins?|logging in|sign ?ins?|signing in|sign ?ups?|signing up|register|registration|user accounts?|customer accounts?|create an account|their accounts?|authenticat\\w*|passwords?|oauth|openid|oidc|sso|single sign[- ]on|otp|one[- ]time (?:codes?|passwords?)|2fa|mfa|two[- ]factor|multi[- ]factor|passkeys?|webauthn|magic links?|social login|sign in with \\w+|auth0|okta|cognito|firebase auth|clerk|next-?auth');
const AUTH_METHODS: Record<string, RegExp> = {
  email_password: W('passwords?|email and password|username and password|email/password'),
  oauth: W('oauth|openid|oidc|sso|single sign[- ]on|social login|(?:google|github|facebook|apple|microsoft|linkedin|twitter) (?:login|sign[- ]?in|accounts?|auth)|sign in with (?:google|github|facebook|apple|microsoft|linkedin|twitter)|auth0|okta|cognito|clerk|next-?auth'),
  otp_sms: W('sms (?:otp|codes?|verification|login)|otp (?:via|by|over) (?:sms|phone)|phone (?:number )?(?:login|verification|otp|sign[- ]?in)|text message codes?'),
  otp_email: W('email (?:otp|codes?|verification codes?)|otp (?:via|by|over) email|one[- ]time codes? (?:by|via) email'),
  passkey: W('passkeys?|webauthn|fido2?'),
  magic_link: W('magic links?|passwordless email|email login links?'),
};
const MFA = W('2fa|mfa|two[- ]factor|multi[- ]factor|authenticator apps?|totp');
const MFA_REQUIRED = W('required|mandatory|enforced?|must|always');

const API = W('(?:node(?:\\.?js)?|express|nest\\.?js|fastify|django|flask|fastapi|rails|laravel|spring(?: boot)?|go|python|java|php|backend|server) apis?|rest(?:ful)? apis?|graphql|grpc|websockets?|socket\\.io|real[- ]time|our apis?|public apis?|an api|apis? for|api endpoints?|endpoints?|backend apis?|json apis?|webhooks?');
const API_STYLE: Record<string, RegExp> = {
  rest: W('rest(?:ful)?'),
  graphql: W('graphql'),
  grpc: W('grpc'),
  websocket: W('websockets?|socket\\.io|real[- ]time'),
};
const THIRD_PARTY_API = W('public apis?|third[- ]part(?:y|ies) (?:developers|apps|integrations?)|partners?|external developers|developers can|api keys? for (?:customers|users|clients)');
const INTERNAL_API = W('microservices?|internal services?|service[- ]to[- ]service');
const USER_URLS = W('link previews?|url previews?|fetch(?:es)? (?:a |the )?(?:urls?|links?)|import from (?:a )?url|(?:user|custom)[- ]supplied urls?|webhook urls?|rss feeds?|scrap(?:e|es|ing|er)');

const DATABASE = W('databases?|db|postgres(?:ql)?|mysql|mariadb|sqlite|sql server|mssql|oracle|mongo(?:db)?|dynamodb|firestore|firebase|supabase|neon|planetscale|redis|sql');
const DB_ENGINES: [string, RegExp][] = [
  ['postgres', W('postgres(?:ql)?|supabase|neon|aurora postgres')],
  ['mysql', W('mysql|mariadb|planetscale')],
  ['sqlite', W('sqlite')],
  ['mssql', W('sql server|mssql')],
  ['oracle', W('oracle')],
  ['mongodb', W('mongo(?:db)?')],
  ['dynamodb', W('dynamodb')],
  ['firestore', W('firestore|firebase')],
  ['redis', W('redis')],
];

const UPLOAD = W('uploads?|uploading|uploaded|attachments?|profile (?:pictures?|photos?)|avatars?|file sharing|share files|import (?:csv|excel|files?)');
const UPLOAD_TYPES: Record<string, RegExp> = {
  images: W('images?|photos?|pictures?|avatars?|jpe?g|png'),
  documents: W('documents?|pdfs?|docx?|csv|excel|spreadsheets?|resumes?|cvs|invoices?'),
  archives: W('zips?|archives?'),
  video: W('videos?|mp4'),
  any: W('any (?:files?|types?)'),
};
const OBJECT_STORAGE = W('s3|object storage|cloud storage|gcs|blob storage|azure blob|cloudinary|r2|buckets?');
const LOCAL_DISK = W('local disk|on the server|file ?system');
const PRIVATE_UPLOADS = W('private|only (?:the )?(?:owner|uploader|user) can (?:see|view|access)');

const PAYMENTS = W('payments?|pay|paying|paid|checkout|stripe|paypal|braintree|adyen|razorpay|square|subscriptions?|billing|in[- ]app purchases?|iap|credit cards?|debit cards?|upi');
const PAY_PROVIDERS = ['stripe', 'paypal', 'braintree', 'adyen', 'razorpay', 'square'];
const IAP = W('in[- ]app purchases?|iap');
const PAY_INTEGRATION: Record<string, RegExp> = {
  hosted_checkout: W('stripe checkout|hosted checkout|payment links?|paypal checkout|redirect(?:s|ed)? to (?:stripe|paypal|the payment page)'),
  embedded_fields: W('stripe elements|payment element|card (?:form|fields)|drop-?in'),
  direct_api: W('directly (?:charge|call)|payment api|server[- ]side charges?'),
};

const AI = W('ai|a\\.i\\.|llms?|gpt[-\\w]*|openai|chatgpt|claude|anthropic|gemini|mistral|ollama|chat ?bots?|rag|embeddings?|vector (?:db|database|search|store)|ai agents?|agentic|summari[sz](?:e|es|ation|ing)|copilot|generative|genai|machine learning|ml models?');
const AI_CAPABILITIES: Record<string, RegExp> = {
  chat: W('chat ?bots?|chat|assistants?|conversational'),
  rag: W('rag|retrieval|embeddings?|vector|knowledge base|semantic search|search (?:over|across|through) (?:documents|docs|files)|answers? questions? about (?:their|your|uploaded) (?:documents|files|data)'),
  tools: W('tool (?:use|calling)|function calling|tools|actions on behalf|mcp'),
  agent: W('ai agents?|agentic|autonomous agents?|agents? that'),
};
const AI_HOSTED = W('openai|gpt[-\\w]*|chatgpt|anthropic|claude|gemini|bedrock|azure openai|mistral|cohere|groq');
const AI_SELF_HOSTED = W('ollama|self[- ]hosted (?:models?|llms?)|local (?:models?|llms?)|llama\\.?cpp|hugging ?face|our own models?|on[- ]prem\\w*');

const RENDERING: [string, RegExp][] = [
  ['server_rendered', W('next\\.?js|nuxt|remix|django|rails|laravel|php|server[- ]rendered|ssr|wordpress|asp\\.net')],
  ['spa', W('react(?! native)|vue|angular|svelte|single[- ]page|spa|vite')],
  ['static', W('static (?:sites?|websites?|pages?)|landing pages?|blog|gatsby|hugo|jekyll|astro')],
];
const USER_HTML = W('rich text|wysiwyg|html editor|markdown (?:editor|posts?|comments?)|user[- ]generated (?:content|html|posts)|forums?|cms');

const WEBVIEW = W('web ?views?|in-app browser');
const DEEP_LINKS = W('deep ?links?|universal links?|app links?');
const BIOMETRICS = W('biometrics?|face ?id|touch ?id|fingerprint');
const DEVICE_STORAGE = W('offline|cache|caches|stored? (?:on|in) the (?:device|phone)|local storage|keychain|keystore|remember me|stays? logged in');
const DEVICE_DATA: Record<string, RegExp> = {
  personal_data: W('personal|profiles?|contacts|user data|messages|chat history'),
  payment_data: W('saved cards|store(?:s|d)? cards'),
  health_data: W('health|medical|fitness|heart rate|steps|symptoms|patients?'),
  offline_cache: W('offline|cache|caches'),
  encryption_keys: W('encryption keys?|private keys?|crypto wallets?|wallet keys?'),
};

const SECRET_STORE: Record<string, RegExp> = {
  env_vars: W('env(?:ironment)? var(?:iable)?s|\\.env'),
  secrets_manager: W('secrets? manager|vault|parameter store|key vault|doppler|infisical'),
  config_files: W('config(?:uration)? files?'),
};
const API_KEYS = W('api keys?|secrets?|tokens?');
const LOG_DEST: Record<string, RegExp> = {
  siem: W('siem|splunk|sentinel|qradar'),
  log_service: W('sentry|datadog|new relic|logtail|papertrail|elastic(?:search)?|loki|cloudwatch|grafana'),
};
const REGULATED = W('hipaa|pci|gdpr|regulated|health|medical|patients?|financial');

const AWS_SERVICES: Record<string, [string, RegExp][]> = {
  aws_compute: [
    ['ec2', W('ec2')],
    ['ecs', W('ecs|fargate')],
    ['eks', W('eks')],
    ['lambda', W('lambda|serverless')],
    ['elastic_beanstalk', W('elastic beanstalk')],
    ['app_runner', W('app runner')],
    ['lightsail', W('lightsail')],
    ['batch', W('aws batch')],
  ],
  aws_database: [
    ['rds', W('rds')],
    ['aurora', W('aurora')],
    ['dynamodb', W('dynamodb')],
    ['elasticache', W('elasticache')],
    ['memorydb', W('memorydb')],
    ['documentdb', W('documentdb')],
    ['neptune', W('neptune')],
    ['keyspaces', W('keyspaces')],
    ['timestream', W('timestream')],
  ],
  aws_storage: [
    ['s3', W('s3')],
    ['ebs', W('ebs')],
    ['efs', W('efs')],
    ['fsx', W('fsx')],
    ['backup', W('aws backup')],
  ],
  aws_end_user: [
    ['workspaces', W('workspaces')],
    ['appstream', W('appstream')],
  ],
};
const AWS_ORG = W('aws organizations?|multiple aws accounts|multi[- ]account');
const AWS_FEDERATED = W('iam identity center|aws sso|saml|azure ad|entra');
const PUBLIC_CONTENT = W('public (?:buckets?|assets|files)|cloudfront|static assets');

const HIGH_DATA = W('payments?|credit cards?|card numbers?|bank(?:s|ing)?|financ\\w*|fintech|loans?|insurance|health\\w*|medical|patients?|clinics?|hospitals?|doctors?|prescriptions?|therapy|hipaa|pci|government ids?|passports?|ssn|social security|aadhaar|pan cards?|tax(?:es)?|payroll|salar(?:y|ies)|kyc|biometric data|children|kids|minors|confidential|legal documents?|crypto(?:currency)? wallets?');
const LOW_DATA = W('no personal data|public (?:content|information|data) only|static (?:sites?|websites?)|anonymous');
const LEVEL_3 = W('bank(?:s|ing)?|healthcare|hospitals?|medical records|patients?|government|critical infrastructure|defen[cs]e|military|insurance|stock trading|brokerage|crypto exchange|hipaa');

const NAME = /\b(?:called|named|name is|app name:?)\s+["'“‘]?([A-Za-z0-9][\w.-]*(?: [A-Z0-9][\w.-]*){0,3})/;

/** Read a plain-language description of an app. */
export function detectFromText(input: string): TextDetection {
  const text = input.slice(0, MAX_DESCRIPTION_LENGTH);
  // Clauses: sentences, lines, and "but"/"except" turns, so a negation does not leak into the next thought.
  const clauses = text.split(/[.!?;\n]+|\s(?:but|except|however)\s/i).map((c) => c.trim()).filter(Boolean);
  const all = (re: RegExp) => find(clauses, re);
  const any = (re: RegExp) => all(re).length > 0;
  const pick = <T extends string>(table: Record<T, RegExp>) => (Object.keys(table) as T[]).filter((k) => any(table[k]));

  const platformEvidence: Partial<Record<Platform, string[]>> = {};
  const addPlatform = (p: Platform, evidence: string[]) => {
    if (evidence.length > 0) platformEvidence[p] = [...new Set([...(platformEvidence[p] ?? []), ...evidence])];
  };
  for (const p of Object.keys(PLATFORM_WORDS) as Platform[]) addPlatform(p, all(PLATFORM_WORDS[p]));
  const mobile = all(CROSS_PLATFORM_MOBILE);
  if (!platformEvidence.android && !platformEvidence.ios) {
    addPlatform('android', mobile);
    addPlatform('ios', mobile);
  }

  const components: DetectedComponent[] = [];
  const add = (type: string, evidence: string[], options: Record<string, unknown> = {}, name?: string) => {
    components.push({ type, ...(name ? { name } : {}), options, evidence: [...new Set(evidence)] });
  };
  const isMobile = () => Boolean(platformEvidence.android || platformEvidence.ios);

  const authEvidence = all(AUTH);
  const paymentEvidence = all(PAYMENTS);
  const dbEvidence = all(DATABASE);
  const uploadEvidence = all(UPLOAD);
  const aiEvidence = all(AI);
  const apiEvidence = all(API);

  // Server-side features imply a backend, and anything at all implies at least a web app.
  const backendFeatures = [...authEvidence, ...paymentEvidence, ...dbEvidence, ...uploadEvidence, ...aiEvidence, ...apiEvidence];
  if (!platformEvidence.backend && backendFeatures.length > 0) addPlatform('backend', backendFeatures.slice(0, 3));
  if (Object.keys(platformEvidence).length === 1 && platformEvidence.backend && !any(W('apis?|microservices?|backend only'))) {
    addPlatform('web', platformEvidence.backend.slice(0, 1));
  }
  const platforms = (['web', 'backend', 'android', 'ios', 'cloud'] as Platform[]).filter((p) => platformEvidence[p]);
  const on = (p: Platform) => platforms.includes(p);

  const rendering = on('web') ? RENDERING.find(([, re]) => any(re))?.[0] : undefined;
  if (on('web')) {
    add('web_frontend', platformEvidence.web ?? [], {
      ...(rendering ? { rendering } : {}),
      ...(any(USER_HTML) ? { user_html: true } : {}),
    });
  }

  if (authEvidence.length > 0) {
    const methods = pick(AUTH_METHODS);
    const mfa = all(MFA);
    const mfaRequired = mfa.length > 0 && clauses.some((c) => MFA.test(c) && MFA_REQUIRED.test(c));
    add('auth', [...authEvidence, ...mfa], {
      ...(methods.length > 0 ? { methods } : {}),
      ...(mfa.length > 0 ? { mfa: mfaRequired ? 'required' : 'optional' } : {}),
    });
    const kind = any(W('jwts?|json web tokens?')) ? 'jwt' : any(W('sessions?|session cookies?')) ? 'server_session' : undefined;
    const transport = any(W('cookies?')) ? 'cookie' : any(W('bearer|authorization header')) ? 'authorization_header' : undefined;
    add('session', authEvidence.slice(0, 2), { ...(kind ? { kind } : {}), ...(transport ? { transport } : {}) });
  }

  // A single-page app or a mobile app always talks to its backend through an API.
  if (on('backend') && (apiEvidence.length > 0 || isMobile() || rendering === 'spa' || any(THIRD_PARTY_API))) {
    const consumers = [
      ...(on('web') ? ['own_frontend'] : []),
      ...(isMobile() ? ['own_mobile_app'] : []),
      ...(any(THIRD_PARTY_API) ? ['third_parties'] : []),
      ...(any(INTERNAL_API) ? ['internal_services'] : []),
    ];
    const style = pick(API_STYLE);
    add('api', apiEvidence.length > 0 ? apiEvidence : ['the app talks to its backend'], {
      ...(style.length > 0 ? { style } : {}),
      ...(consumers.length > 0 ? { consumers } : {}),
      ...(any(USER_URLS) ? { fetches_user_urls: true } : {}),
    });
  }

  if (dbEvidence.length > 0) {
    const engines = DB_ENGINES.filter(([, re]) => any(re)).map(([engine]) => engine);
    if (engines.length === 0) add('database', dbEvidence, { kind: 'sql' });
    for (const engine of engines) {
      add('database', all(DB_ENGINES.find(([e]) => e === engine)![1]), { engine, kind: ENGINE_KIND[engine] ?? 'sql' }, engines.length > 1 ? engine : undefined);
    }
  }

  if (uploadEvidence.length > 0) {
    const types = pick(UPLOAD_TYPES);
    const storage = any(OBJECT_STORAGE) ? 'object_storage' : any(LOCAL_DISK) ? 'local_disk' : undefined;
    add('file_upload', uploadEvidence, {
      ...(types.length > 0 ? { types: types.includes('any') ? ['any'] : types } : {}),
      ...(storage ? { storage } : {}),
      ...(any(PRIVATE_UPLOADS) ? { served_to_other_users: false } : {}),
    });
  }

  if (paymentEvidence.length > 0) {
    const named = PAY_PROVIDERS.filter((p) => any(W(p)));
    const iap = any(IAP);
    const provider = named[0] ?? (iap && on('ios') ? 'app_store_iap' : iap && on('android') ? 'google_play_billing' : undefined);
    const integration = (Object.keys(PAY_INTEGRATION) as string[]).find((k) => any(PAY_INTEGRATION[k]!));
    add('payments', paymentEvidence, { ...(provider ? { provider } : {}), ...(integration ? { integration } : {}) });
  }

  if (aiEvidence.length > 0) {
    const capabilities = pick(AI_CAPABILITIES);
    const provider = any(AI_SELF_HOSTED) ? 'self_hosted' : any(AI_HOSTED) ? 'hosted_api' : undefined;
    add('ai_feature', aiEvidence, { ...(capabilities.length > 0 ? { capabilities } : {}), ...(provider ? { provider } : {}) });
  }

  if (isMobile()) {
    add('mobile_platform', [...(platformEvidence.android ?? []), ...(platformEvidence.ios ?? [])], {
      ...(any(WEBVIEW) ? { webviews: true } : {}),
      ...(any(DEEP_LINKS) ? { deep_links: true } : {}),
      ...(any(BIOMETRICS) ? { biometrics: true } : {}),
    });
    const stored = all(DEVICE_STORAGE);
    if (stored.length > 0 || authEvidence.length > 0) {
      const data = [...(authEvidence.length > 0 ? ['auth_tokens'] : []), ...pick(DEVICE_DATA)];
      add('mobile_storage', stored.length > 0 ? stored : ['login tokens on the device'], data.length > 0 ? { data } : {});
    }
  }

  if (on('backend')) {
    const storage = pick(SECRET_STORE)[0];
    const ci = any(W('ci/cd|ci|github actions|gitlab ci|pipelines?|jenkins|circleci'));
    add('secrets', all(API_KEYS).length > 0 ? all(API_KEYS) : ['every backend has secrets'], { ...(storage ? { storage } : {}), ...(ci ? { ci_cd: true } : {}) });
    const destination = (Object.keys(LOG_DEST) as string[]).find((k) => any(LOG_DEST[k]!));
    add('logging', ['every backend writes logs'], { ...(destination ? { destination } : {}), ...(any(REGULATED) ? { regulated_data: true } : {}) });
  }

  if (on('cloud')) {
    add('aws_account', platformEvidence.cloud ?? [], {
      ...(any(AWS_ORG) ? { organization: true } : {}),
      ...(any(AWS_FEDERATED) ? { federated_identity: true } : {}),
    });
    for (const [type, table] of Object.entries(AWS_SERVICES)) {
      const services = table.filter(([, re]) => any(re));
      if (services.length === 0) continue;
      add(type, services.flatMap(([, re]) => all(re)), {
        services: services.map(([s]) => s),
        ...(type === 'aws_storage' && any(PUBLIC_CONTENT) ? { public_content: true } : {}),
      });
    }
  }

  const high = paymentEvidence.length > 0 || any(HIGH_DATA);
  const data_sensitivity = high ? 'high' : any(LOW_DATA) && authEvidence.length === 0 ? 'low' : 'medium';
  const assurance_level = any(LEVEL_3) ? 3 : data_sensitivity === 'low' ? 1 : 2;
  const name = NAME.exec(text)?.[1]?.trim();

  return {
    detection: { ...(name ? { name } : {}), platforms, platformEvidence, components },
    data_sensitivity,
    assurance_level,
  };
}
