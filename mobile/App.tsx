import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

const FALLBACK_URL = "http://localhost:3000";

type TabId = "SCANNER" | "WEB";
type ScanDestination = "COLLECTION" | "WISHLIST" | "PRICE_CHECK";

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER";
};

type ScanResult = {
  itemKind?: "RAW_CARD" | "GRADED_SLAB" | "SEALED_PRODUCT" | "UNKNOWN";
  ocr?: { text?: string; confidence?: number };
  barcode?: { value?: string; format?: string } | null;
  match?: {
    card?: { name?: string; cardNumber?: string; setCode?: string } | null;
  } | null;
  setMatch?: { name?: string; code?: string } | null;
  priceCheck?: {
    card?: { raw?: number; psa10?: number; tag10?: number; gemRateBlended?: number } | null;
    set?: { totalSetValue?: number } | null;
    sealedEstimateUsd?: number | null;
  } | null;
  error?: string;
};

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return FALLBACK_URL;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

function toApiBase(url: string): string {
  return normalizeUrl(url).replace(/\/+$/, "");
}

function usd(value?: number | null): string {
  return typeof value === "number" ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "-";
}

export default function App() {
  const envUrl = process.env.EXPO_PUBLIC_GEMINDEX_URL;
  const initialUrl = useMemo(() => normalizeUrl(envUrl ?? FALLBACK_URL), [envUrl]);
  const [tab, setTab] = useState<TabId>("SCANNER");
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [activeUrl, setActiveUrl] = useState(initialUrl);
  const [loadingWeb, setLoadingWeb] = useState(false);

  const [email, setEmail] = useState("demo@gemindex.local");
  const [password, setPassword] = useState("demo1234");
  const [authBusy, setAuthBusy] = useState(false);
  const [session, setSession] = useState<SessionUser | null>(null);

  const [destination, setDestination] = useState<ScanDestination>("PRICE_CHECK");
  const [targetPrice, setTargetPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [message, setMessage] = useState("");

  const apiBase = useMemo(() => toApiBase(activeUrl), [activeUrl]);

  async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      credentials: "include",
    });

    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? `Request failed (${response.status})`);
    }
    return payload;
  }

  async function login() {
    try {
      setAuthBusy(true);
      const out = await apiJson<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setSession(out.user);
      setMessage(`Signed in as ${out.user.email}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign in failed");
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    try {
      setAuthBusy(true);
      await apiJson("/api/auth/logout", { method: "POST", body: "{}" });
      setSession(null);
      setMessage("Signed out.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign out failed");
    } finally {
      setAuthBusy(false);
    }
  }

  async function runImageScan(uri: string, mimeType: string | null) {
    try {
      setScanBusy(true);
      setMessage("");

      const formData = new FormData();
      formData.append("destination", destination);
      formData.append("quantity", quantity || "1");
      if (targetPrice.trim()) {
        formData.append("targetPriceUsd", targetPrice.trim());
      }
      formData.append("image", {
        uri,
        name: `scan-${Date.now()}.jpg`,
        type: mimeType ?? "image/jpeg",
      } as unknown as Blob);

      const response = await fetch(`${apiBase}/api/scanner/image`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as ScanResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Image scan failed (${response.status})`);
      }
      setScanResult(payload);
      setMessage(destination === "PRICE_CHECK" ? "Price check complete." : "Image scan complete.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setScanBusy(false);
    }
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Media library permission is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      quality: 0.9,
      mediaTypes: ["images"],
    });

    if (result.canceled || !result.assets.length) {
      return;
    }

    const asset = result.assets[0];
    await runImageScan(asset.uri, asset.mimeType ?? null);
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setMessage("Camera permission is required.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.9,
      mediaTypes: ["images"],
    });

    if (result.canceled || !result.assets.length) {
      return;
    }

    const asset = result.assets[0];
    await runImageScan(asset.uri, asset.mimeType ?? null);
  }

  function saveUrl() {
    setActiveUrl(normalizeUrl(inputUrl));
    setMessage("");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={styles.container}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Gem Index Mobile</Text>
          <Text style={styles.subtitle}>Scanner-first flow for card, slab, and sealed detection.</Text>
          <View style={styles.controls}>
            <TextInput
              value={inputUrl}
              onChangeText={setInputUrl}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://your-gemindex-url"
              placeholderTextColor="#64748b"
              style={styles.input}
            />
            <View style={styles.buttonRow}>
              <Pressable onPress={saveUrl} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
                <Text style={styles.buttonText}>Use URL</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setInputUrl(initialUrl);
                  setActiveUrl(initialUrl);
                }}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.secondaryButtonText}>Reset</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.tabRow}>
            <Pressable
              style={({ pressed }) => [styles.tabButton, tab === "SCANNER" && styles.tabActive, pressed && styles.buttonPressed]}
              onPress={() => setTab("SCANNER")}
            >
              <Text style={styles.tabLabel}>Scanner</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.tabButton, tab === "WEB" && styles.tabActive, pressed && styles.buttonPressed]}
              onPress={() => setTab("WEB")}
            >
              <Text style={styles.tabLabel}>Web App</Text>
            </Pressable>
          </View>
        </View>

        {tab === "SCANNER" ? (
          <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Session</Text>
              <Text style={styles.muted}>
                {session ? `Signed in: ${session.email}` : "Sign in to add to collection/wishlist. Price check can run unauthenticated if your backend allows it."}
              </Text>
              {!session ? (
                <View style={styles.gap}>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Email"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholder="Password"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                  <Pressable style={styles.button} onPress={login} disabled={authBusy}>
                    <Text style={styles.buttonText}>{authBusy ? "Signing in..." : "Sign In"}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.secondaryButton} onPress={logout} disabled={authBusy}>
                  <Text style={styles.secondaryButtonText}>{authBusy ? "Working..." : "Sign Out"}</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Scan Target</Text>
              <View style={styles.buttonRow}>
                {(["PRICE_CHECK", "COLLECTION", "WISHLIST"] as ScanDestination[]).map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setDestination(value)}
                    style={[
                      styles.chip,
                      destination === value && styles.chipActive,
                    ]}
                  >
                    <Text style={styles.chipText}>{value.replace("_", " ")}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.inlineFields}>
                <TextInput
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="number-pad"
                  style={[styles.input, styles.smallInput]}
                  placeholder="Qty"
                  placeholderTextColor="#94a3b8"
                />
                <TextInput
                  value={targetPrice}
                  onChangeText={setTargetPrice}
                  keyboardType="decimal-pad"
                  style={[styles.input, styles.smallInput]}
                  placeholder="Target $"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.buttonRow}>
                <Pressable style={styles.button} onPress={takePhoto} disabled={scanBusy}>
                  <Text style={styles.buttonText}>{scanBusy ? "Scanning..." : "Snap Photo"}</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={pickFromLibrary} disabled={scanBusy}>
                  <Text style={styles.secondaryButtonText}>Choose Photo</Text>
                </Pressable>
              </View>
            </View>

            {scanBusy ? (
              <View style={styles.loaderInline}>
                <ActivityIndicator size="small" color="#0f766e" />
                <Text style={styles.muted}>Analyzing image...</Text>
              </View>
            ) : null}

            {scanResult ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Scan Result</Text>
                <Text style={styles.muted}>Kind: {scanResult.itemKind ?? "UNKNOWN"}</Text>
                <Text style={styles.muted}>OCR confidence: {(scanResult.ocr?.confidence ?? 0).toFixed(1)}</Text>
                {scanResult.barcode?.value ? (
                  <Text style={styles.muted}>Barcode: {scanResult.barcode.value} ({scanResult.barcode.format ?? "unknown"})</Text>
                ) : null}
                {scanResult.match?.card ? (
                  <Text style={styles.muted}>
                    Card: {scanResult.match.card.name} {scanResult.match.card.cardNumber} ({scanResult.match.card.setCode})
                  </Text>
                ) : null}
                {scanResult.setMatch ? (
                  <Text style={styles.muted}>Set: {scanResult.setMatch.name} ({scanResult.setMatch.code})</Text>
                ) : null}
                {scanResult.priceCheck?.card ? (
                  <Text style={styles.muted}>
                    Prices RAW {usd(scanResult.priceCheck.card.raw)} | PSA10 {usd(scanResult.priceCheck.card.psa10)} | TAG10 {usd(scanResult.priceCheck.card.tag10)}
                  </Text>
                ) : null}
                {scanResult.priceCheck?.set ? (
                  <Text style={styles.muted}>Set Value: {usd(scanResult.priceCheck.set.totalSetValue)}</Text>
                ) : null}
                {scanResult.priceCheck?.sealedEstimateUsd ? (
                  <Text style={styles.muted}>Sealed Estimate: {usd(scanResult.priceCheck.sealedEstimateUsd)}</Text>
                ) : null}
              </View>
            ) : null}

            {message ? <Text style={styles.message}>{message}</Text> : null}
          </ScrollView>
        ) : (
          <View style={styles.webviewWrap}>
            {loadingWeb ? (
              <View style={styles.loader}>
                <ActivityIndicator size="large" color="#0f766e" />
                <Text style={styles.loaderText}>Loading {activeUrl}</Text>
              </View>
            ) : null}
            <WebView
              source={{ uri: activeUrl }}
              style={styles.webview}
              onLoadStart={() => setLoadingWeb(true)}
              onLoadEnd={() => setLoadingWeb(false)}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#020617",
  },
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    backgroundColor: "#0f172a",
  },
  title: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 4,
    color: "#94a3b8",
    fontSize: 12,
  },
  controls: {
    marginTop: 10,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0b1220",
    color: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  inlineFields: {
    marginTop: 8,
    marginBottom: 8,
    flexDirection: "row",
    gap: 8,
  },
  smallInput: {
    flex: 1,
  },
  button: {
    backgroundColor: "#0f766e",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: "#f8fafc",
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  secondaryButtonText: {
    color: "#e2e8f0",
    fontWeight: "600",
  },
  tabRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  tabButton: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  tabActive: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
  },
  tabLabel: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  screen: {
    flex: 1,
    backgroundColor: "#020617",
  },
  screenContent: {
    padding: 12,
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 12,
    backgroundColor: "#0b1220",
    padding: 10,
    gap: 8,
  },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "700",
  },
  muted: {
    color: "#cbd5e1",
    fontSize: 12,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipActive: {
    borderColor: "#14b8a6",
    backgroundColor: "#0f766e",
  },
  chipText: {
    color: "#e2e8f0",
    fontSize: 11,
    fontWeight: "600",
  },
  gap: {
    gap: 8,
  },
  loaderInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
  },
  message: {
    color: "#facc15",
    fontSize: 12,
  },
  webviewWrap: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  webview: {
    flex: 1,
  },
  loader: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(248, 250, 252, 0.96)",
    zIndex: 10,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  loaderText: {
    color: "#0f172a",
    fontSize: 12,
    paddingHorizontal: 16,
    textAlign: "center",
  },
});
