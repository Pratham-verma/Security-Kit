import AsyncStorage from "@react-native-async-storage/async-storage";
declare const token: string;

// ruleid: seckit.mstore-c1.token-in-asyncstorage
AsyncStorage.setItem("refreshToken", token);
// ok: seckit.mstore-c1.token-in-asyncstorage
AsyncStorage.setItem("onboardingSeen", "1");
