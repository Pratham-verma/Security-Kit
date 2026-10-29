void setup(String apiKey) {
  // ruleid: seckit.ai-c8.dart-llm-sdk-in-app
  final model = GenerativeModel(model: 'gemini-2.0-flash', apiKey: apiKey);
  // ruleid: seckit.ai-c8.dart-llm-sdk-in-app
  OpenAI.apiKey = const String.fromEnvironment('OPENAI_KEY');
  // ok: seckit.ai-c8.dart-llm-sdk-in-app
  final proxied = FirebaseAI.googleAI().generativeModel(model: 'gemini-2.0-flash');
}
