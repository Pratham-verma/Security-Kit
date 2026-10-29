// Which knowledge-base components does a file touch? Heuristics over path, extension and content.
// Over-matching is cheap (the assistant sees a few extra rules); missing a component is not.
import type { Platform } from '@seckit/core';

export interface ComponentMatch {
  component: string;
  reason: string;
}

interface Signal {
  component: string;
  path?: RegExp;
  content?: RegExp;
}

const SIGNALS: Signal[] = [
  {
    component: 'auth',
    path: /(^|\/)(auth|login|logout|signup|sign-up|register|password|oauth|passport|accounts?)([./_-]|$)/i,
    content: /\b(bcrypt|argon2|passport|next-auth|@auth\/|signIn|signUp|authenticate|password|passlib|check_password|LoginManager|login_user|PasswordEncoder|UserDetailsService|SecurityFilterChain|local_auth)\b/i,
  },
  {
    component: 'session',
    path: /(^|\/)(session|middleware|token)s?([./_-]|$)/i,
    content: /\b(jsonwebtoken|jwt\.|jose|express-session|res\.cookie|set_cookie|setCookie|cookies?\.set|localStorage|sessionStorage|refresh_?token|access_?token|req\.session|request\.session|SESSION_COOKIE|HttpSession|ResponseCookie|Jwts|JWT\.require|JWT\.decode|csrf\(|SharedPreferences|flutter_secure_storage)\b/i,
  },
  {
    component: 'web_frontend',
    path: /\.(tsx|jsx|vue|svelte|astro|html?|ejs|hbs|handlebars|njk|jinja2?|liquid|erb|jsp|jspx|ftl|mustache)$|(^|\/)templates\//i,
    content: /\b(innerHTML|outerHTML|dangerouslySetInnerHTML|document\.write|window\.location|v-html|mark_safe|Markup\(|render_template|res\.redirect|HttpResponseRedirect|sendRedirect|RedirectView|th:utext)\b|"redirect:/,
  },
  {
    component: 'api',
    path: /(^|\/)(routes?|controllers?|api|handlers?|endpoints?|views?|resolvers?|urls)([./_-]|\/|$)/i,
    content: /\b(app|router|server)\.(get|post|put|patch|delete|use|route)\(|@(Get|Post|Put|Patch|Delete|Controller)\(|@(RestController|RequestMapping|GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|CrossOrigin)\b|RestTemplate|WebClient|Router\(\)|@app\.(route|get|post|put|patch|delete)|APIRouter|@api_view|urlpatterns|ApolloServer|graphql|fetch\(|axios|requests\.(get|post)|httpx\./,
  },
  {
    component: 'database',
    path: /(^|\/)(db|database|models?|repositor(y|ies)|migrations?|schema|dao|queries)([./_-]|\/|$)|\.(sql|prisma)$/i,
    content: /\b(SELECT\s.+\sFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|prisma\.|knex|sequelize|typeorm|mongoose|pymongo|sqlalchemy|\.objects\.|cursor\.|rawQuery|execSQL|createPool|new Pool\(|MongoClient|JdbcTemplate|EntityManager|createQuery|createNativeQuery|executeQuery|prepareStatement|JpaRepository|sqflite)\b|\.query\(|\.execute\(/i,
  },
  {
    component: 'file_upload',
    path: /(^|\/)uploads?([./_-]|\/|$)/i,
    content: /\b(multer|busboy|formidable|multipart|FileStorage|request\.files|req\.files?|UploadFile|originalname|FileReader|input type=["']file|MultipartFile|getOriginalFilename|FilePart|image_picker|file_picker)\b/i,
  },
  {
    component: 'payments',
    path: /(^|\/)(payments?|billing|checkout|stripe|subscriptions?|webhooks?)([./_-]|\/|$)/i,
    content: /\b(stripe|paypal|braintree|adyen|razorpay|paymentIntent|PaymentIntent|PaymentIntentCreateParams|checkout\.sessions|BillingClient|StoreKit|SKPayment|InAppPurchase)\b/,
  },
  {
    component: 'secrets',
    path: /(^|\/)(\.env[^/]*|config|settings|secrets?)([./_-]|$)|\.github\/workflows\//i,
    content: /\b(process\.env|import\.meta\.env|os\.environ|os\.getenv|getenv\(|API_KEY|SECRET|PRIVATE_KEY|dotenv|BuildConfig\.)/,
  },
  {
    component: 'logging',
    path: /(^|\/)(log(ger|ging)?|telemetry|monitoring)([./_-]|$)/i,
    content: /\b(console\.(log|info|warn|error|debug)|logger\.|logging\.|winston|pino|structlog|Log\.[dievw]\(|NSLog|os_log|LoggerFactory|log\.(trace|debug|info|warn|error)\(|@Slf4j)\b|\.status\(5\d\d\)/,
  },
  {
    component: 'mobile_storage',
    path: /\.(swift|m|mm|dart)$|(^|\/)(android|app\/src\/(main|debug|release))\/.*\.(kt|kts|java)$/i,
    content: /\b(SharedPreferences|UserDefaults|Keychain|kSecAttr|AsyncStorage|SecureStore|DataStore|EncryptedSharedPreferences|CoreData|Room\.databaseBuilder|MMKV|FlutterSecureStorage|Hive|sqflite)\b/,
  },
  {
    component: 'mobile_platform',
    path: /(^|\/)(AndroidManifest\.xml|Info\.plist|network_security_config\.xml|[^/]+\.entitlements|build\.gradle(\.kts)?)$/i,
    content: /\b(WebView|WKWebView|TrustManager|HostnameVerifier|URLSession|URLAuthenticationChallenge|BiometricPrompt|LAContext|intent-filter|NSAppTransportSecurity|getIntent\(\)|onNewIntent|openURL|PlayIntegrity|DCAppAttestService|badCertificateCallback|InAppWebView|WebViewController|LocalAuthentication|app_links|uni_links)\b/,
  },
  {
    component: 'ai_feature',
    path: /(^|\/)(ai|llm|agents?|prompts?|chat|rag|embeddings?)([./_-]|\/|$)/i,
    content: /\b(openai|anthropic|@ai-sdk|langchain|llama_?index|chat\.completions|messages\.create|generateText|streamText|embeddings?|vector_?store|ChatOpenAI|ChatAnthropic|ChatClient|ChatLanguageModel|GenerativeModel|langchain4j|spring-ai)\b/i,
  },
];

export function classifyFile(path: string, content: string): ComponentMatch[] {
  const matches: ComponentMatch[] = [];
  for (const s of SIGNALS) {
    if (s.path?.test(path)) matches.push({ component: s.component, reason: 'file path' });
    else if (s.content) {
      const m = content.match(s.content);
      if (m) matches.push({ component: s.component, reason: `uses "${m[0].slice(0, 40)}"` });
    }
  }
  return matches;
}

/** Platforms a file can belong to, from its extension and location; undefined when it could be either. */
export function filePlatforms(path: string): Platform[] | undefined {
  // Kotlin/Java are Android only in Android-shaped paths; Spring or Ktor backends use them too.
  if (/\.(kt|kts|java)$/i.test(path)) return /(^|\/)(android|app\/src\/(main|debug|release))\//i.test(path) ? ['android'] : undefined;
  if (/\.(swift|m|mm)$/i.test(path)) return ['ios'];
  // Dart is Flutter (Android + iOS) unless it lives in a server folder (shelf, dart_frog).
  if (/\.dart$/i.test(path)) return /(^|\/)(bin|server|routes)\//i.test(path) ? ['backend'] : ['android', 'ios'];
  if (/\.(tsx|jsx|vue|svelte|astro|html?|css)$/i.test(path)) return ['web'];
  if (/\.(py|rb|php|go|rs|cs|sql|prisma)$/i.test(path)) return ['backend'];
  if (/(^|\/)(server|backend|api|functions|lambda|routes|controllers|services)\//i.test(path)) return ['backend'];
  if (/(^|\/)(client|frontend|public|static)\//i.test(path)) return ['web'];
  return undefined;
}
