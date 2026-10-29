import { WebView } from "react-native-webview";

// ruleid: seckit.mplat-c4.react-native-webview-unrestricted
export const A = () => <WebView source={{ uri: "https://x.example" }} originWhitelist={["*"]} />;
// ruleid: seckit.mplat-c4.react-native-webview-unrestricted
export const B = () => <WebView source={{ uri: "https://x.example" }} allowUniversalAccessFromFileURLs={true} />;
// ok: seckit.mplat-c4.react-native-webview-unrestricted
export const C = () => <WebView source={{ uri: "https://x.example" }} originWhitelist={["https://x.example"]} />;
