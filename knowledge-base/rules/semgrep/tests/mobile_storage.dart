Future<void> save(SharedPreferences prefs, FlutterSecureStorage storage, String token) async {
  // ruleid: seckit.mstore-c1.dart-token-in-shared-preferences
  await prefs.setString('auth_token', token);
  // ok: seckit.mstore-c1.dart-token-in-shared-preferences
  await prefs.setString('theme', 'dark');
  // ok: seckit.mstore-c1.dart-token-in-shared-preferences
  await storage.write(key: 'auth_token', value: token);

  // ruleid: seckit.mstore-c3.dart-sensitive-log
  print('token: $token');
  // ruleid: seckit.mstore-c3.dart-sensitive-log
  debugPrint(accessToken);
  // ok: seckit.mstore-c3.dart-sensitive-log
  print('Wrong password, try again');

  // ruleid: seckit.mstore-c6.dart-hardcoded-key
  final key = Key.fromUtf8('my32lengthsupersecretnooneknows1');
  // ruleid: seckit.mstore-c6.dart-hardcoded-key
  final box = await Hive.openBox('vault', encryptionCipher: HiveAesCipher([1, 2, 3, 4]));
  // ok: seckit.mstore-c6.dart-hardcoded-key
  final random = Key.fromSecureRandom(32);
}
