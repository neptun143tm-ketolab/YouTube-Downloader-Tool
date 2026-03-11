import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import {
  AudioQuality,
  DownloadMode,
  VideoQuality,
  useDownload,
} from "@/context/DownloadContext";
import { ProgressBar } from "@/components/ProgressBar";

const C = Colors.light;
const BASE_URL = `${process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : ""}/api/download`;

interface VideoInfo {
  title: string;
  thumbnail: string | null;
  duration: number;
  channel: string;
}

function formatDuration(secs: number) {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (!bytes) return "";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

function getStatusLabel(status: string) {
  switch (status) {
    case "pending": return "대기 중...";
    case "downloading": return "다운로드 중...";
    case "converting": return "변환 중...";
    case "done": return "완료";
    case "error": return "오류";
    default: return status;
  }
}

const VIDEO_QUALITIES: VideoQuality[] = ["720p", "1080p", "best"];
const AUDIO_QUALITIES: AudioQuality[] = ["128k", "192k", "256k", "320k"];

export default function DownloadScreen() {
  const insets = useSafeAreaInsets();
  const { currentJob, startDownload, clearCurrentJob } = useDownload();

  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<DownloadMode>("audio");
  const [videoQuality, setVideoQuality] = useState<VideoQuality>("best");
  const [audioQuality, setAudioQuality] = useState<AudioQuality>("192k");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [fetchingInfo, setFetchingInfo] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleUrlChange = async (text: string) => {
    setUrl(text);
    setError(null);
    setVideoInfo(null);
    if (
      (text.includes("youtube.com") || text.includes("youtu.be")) &&
      text.startsWith("http")
    ) {
      setFetchingInfo(true);
      try {
        const res = await fetch(`${BASE_URL}/info`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: text.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          setVideoInfo(data);
        }
      } catch {
        // ignore
      } finally {
        setFetchingInfo(false);
      }
    }
  };

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        await handleUrlChange(text.trim());
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      // ignore
    }
  };

  const handleDownload = async () => {
    const trimmed = url.trim();
    if (!trimmed || (!trimmed.includes("youtube.com") && !trimmed.includes("youtu.be"))) {
      setError("유효한 YouTube URL을 입력해 주세요");
      shake();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setError(null);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await startDownload({ url: trimmed, mode, videoQuality, audioQuality });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "다운로드를 시작할 수 없습니다";
      setError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileDownload = () => {
    if (!currentJob?.jobId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const fileUrl = domain
      ? `https://${domain}/api/download/file/${currentJob.jobId}`
      : `/api/download/file/${currentJob.jobId}`;
    Linking.openURL(fileUrl);
  };

  const handleNewDownload = () => {
    clearCurrentJob();
    setUrl("");
    setVideoInfo(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 16, paddingBottom: botPad + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoBox}>
              <Feather name="youtube" size={20} color={C.tint} />
            </View>
            <View>
              <Text style={styles.headerTitle}>YouTube Downloader</Text>
              <Text style={styles.headerSub}>MP3 / MP4 고속 변환</Text>
            </View>
          </View>

          {/* Job result card */}
          {currentJob ? (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                {currentJob.status === "done" ? (
                  <View style={styles.statusDot} />
                ) : currentJob.status === "error" ? (
                  <View style={[styles.statusDot, { backgroundColor: C.error }]} />
                ) : (
                  <ActivityIndicator size="small" color={C.tint} />
                )}
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {currentJob.title ?? "처리 중..."}
                </Text>
              </View>

              {(currentJob.status === "downloading" || currentJob.status === "converting" || currentJob.status === "pending") && (
                <>
                  <ProgressBar progress={currentJob.progress} />
                  <View style={styles.progressRow}>
                    <Text style={styles.progressLabel}>
                      {getStatusLabel(currentJob.status)}
                    </Text>
                    <Text style={styles.progressPct}>{Math.round(currentJob.progress)}%</Text>
                  </View>
                </>
              )}

              {currentJob.status === "done" && (
                <View style={styles.doneInfo}>
                  <Text style={styles.doneFilename} numberOfLines={1}>
                    {currentJob.filename}
                  </Text>
                  {!!currentJob.filesize && (
                    <Text style={styles.doneSize}>{formatBytes(currentJob.filesize)}</Text>
                  )}
                  <Pressable
                    onPress={handleFileDownload}
                    style={({ pressed }) => [styles.dlButton, pressed && styles.dlButtonPressed]}
                  >
                    <Feather name="download" size={18} color="#fff" />
                    <Text style={styles.dlButtonText}>파일 저장</Text>
                  </Pressable>
                  <Pressable onPress={handleNewDownload} style={styles.newBtn}>
                    <Text style={styles.newBtnText}>새 다운로드</Text>
                  </Pressable>
                </View>
              )}

              {currentJob.status === "error" && (
                <View>
                  <Text style={styles.errorText}>{currentJob.error}</Text>
                  <Pressable onPress={handleNewDownload} style={styles.newBtn}>
                    <Text style={styles.newBtnText}>다시 시도</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <>
              {/* URL Input */}
              <Animated.View
                style={[
                  styles.inputWrapper,
                  { transform: [{ translateX: shakeAnim }] },
                ]}
              >
                <View style={styles.inputRow}>
                  <Feather name="link" size={18} color="rgba(255,255,255,0.4)" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="YouTube URL 붙여넣기..."
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={url}
                    onChangeText={handleUrlChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="go"
                    onSubmitEditing={handleDownload}
                    selectionColor={C.tint}
                  />
                  {url.length > 0 ? (
                    <Pressable
                      onPress={() => { setUrl(""); setVideoInfo(null); }}
                      style={styles.clearBtn}
                    >
                      <Feather name="x" size={16} color="rgba(255,255,255,0.4)" />
                    </Pressable>
                  ) : (
                    <Pressable onPress={handlePaste} style={styles.pasteBtn}>
                      <Text style={styles.pasteBtnText}>붙여넣기</Text>
                    </Pressable>
                  )}
                </View>
              </Animated.View>

              {/* Video info preview */}
              {fetchingInfo && (
                <View style={styles.infoRow}>
                  <ActivityIndicator size="small" color={C.tint} />
                  <Text style={styles.infoText}>정보 로드 중...</Text>
                </View>
              )}
              {videoInfo && !fetchingInfo && (
                <View style={styles.videoInfoCard}>
                  <View style={styles.videoInfoInner}>
                    <Feather name="film" size={16} color={C.tint} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.videoTitle} numberOfLines={2}>{videoInfo.title}</Text>
                      <Text style={styles.videoMeta}>
                        {videoInfo.channel}{videoInfo.duration ? ` • ${formatDuration(videoInfo.duration)}` : ""}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {error && (
                <View style={styles.errorRow}>
                  <Feather name="alert-circle" size={14} color={C.error} />
                  <Text style={styles.errorInline}>{error}</Text>
                </View>
              )}

              {/* Mode Select */}
              <Text style={styles.sectionLabel}>모드</Text>
              <View style={styles.modeRow}>
                {(["audio", "video"] as DownloadMode[]).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => {
                      setMode(m);
                      Haptics.selectionAsync();
                    }}
                    style={[
                      styles.modeBtn,
                      mode === m && styles.modeBtnActive,
                    ]}
                  >
                    <Feather
                      name={m === "audio" ? "music" : "video"}
                      size={16}
                      color={mode === m ? "#fff" : "rgba(255,255,255,0.4)"}
                    />
                    <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                      {m === "audio" ? "오디오만 (MP3)" : "영상+음성 (MP4)"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Quality */}
              {mode === "audio" ? (
                <>
                  <Text style={styles.sectionLabel}>음질</Text>
                  <View style={styles.qualityRow}>
                    {AUDIO_QUALITIES.map((q) => (
                      <Pressable
                        key={q}
                        onPress={() => {
                          setAudioQuality(q);
                          Haptics.selectionAsync();
                        }}
                        style={[styles.qualityBtn, audioQuality === q && styles.qualityBtnActive]}
                      >
                        <Text style={[styles.qualityText, audioQuality === q && styles.qualityTextActive]}>
                          {q}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.sectionLabel}>화질</Text>
                  <View style={styles.qualityRow}>
                    {VIDEO_QUALITIES.map((q) => (
                      <Pressable
                        key={q}
                        onPress={() => {
                          setVideoQuality(q);
                          Haptics.selectionAsync();
                        }}
                        style={[styles.qualityBtn, videoQuality === q && styles.qualityBtnActive]}
                      >
                        <Text style={[styles.qualityText, videoQuality === q && styles.qualityTextActive]}>
                          {q === "best" ? "최고화질" : q}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {/* Download Button */}
              <Pressable
                onPress={handleDownload}
                disabled={loading || !url.trim()}
                style={({ pressed }) => [
                  styles.downloadBtn,
                  (loading || !url.trim()) && styles.downloadBtnDisabled,
                  pressed && styles.downloadBtnPressed,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="download" size={20} color="#fff" />
                    <Text style={styles.downloadBtnText}>다운로드 시작</Text>
                  </>
                )}
              </Pressable>

              {/* Info tip */}
              <View style={styles.tip}>
                <Feather name="info" size={12} color="rgba(255,255,255,0.25)" />
                <Text style={styles.tipText}>
                  완료 후 30분이 지나면 서버에서 파일이 자동 삭제됩니다
                </Text>
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 28,
  },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,59,48,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: C.text,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 1,
  },
  inputWrapper: {
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.backgroundSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: C.text,
  },
  clearBtn: {
    padding: 4,
  },
  pasteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(255,59,48,0.15)",
    borderRadius: 8,
  },
  pasteBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: C.tint,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  infoText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: C.textSecondary,
  },
  videoInfoCard: {
    backgroundColor: C.backgroundSecondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,59,48,0.2)",
  },
  videoInfoInner: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  videoTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: C.text,
    marginBottom: 3,
  },
  videoMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: C.textSecondary,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  errorInline: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: C.error,
    flex: 1,
  },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 10,
  },
  modeRow: { gap: 8 },
  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: C.backgroundSecondary,
    borderWidth: 1,
    borderColor: C.border,
  },
  modeBtnActive: {
    backgroundColor: C.tint,
    borderColor: C.tint,
  },
  modeBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
  },
  modeBtnTextActive: {
    color: "#fff",
  },
  qualityRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  qualityBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 100,
    backgroundColor: C.backgroundSecondary,
    borderWidth: 1,
    borderColor: C.border,
  },
  qualityBtnActive: {
    backgroundColor: "rgba(255,59,48,0.2)",
    borderColor: C.tint,
  },
  qualityText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
  },
  qualityTextActive: {
    color: C.tint,
  },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 28,
    backgroundColor: C.tint,
    paddingVertical: 18,
    borderRadius: 16,
    shadowColor: C.tint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  downloadBtnDisabled: {
    backgroundColor: C.backgroundTertiary,
    shadowOpacity: 0,
  },
  downloadBtnPressed: {
    transform: [{ scale: 0.97 }],
  },
  downloadBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  tip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  tipText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.2)",
    flex: 1,
  },
  // Job card
  card: {
    backgroundColor: C.cardBackground,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    gap: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.success,
    marginTop: 5,
  },
  cardTitle: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: C.text,
    lineHeight: 22,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  progressLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: C.textSecondary,
  },
  progressPct: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: C.tint,
  },
  doneInfo: {
    gap: 10,
  },
  doneFilename: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: C.textSecondary,
  },
  doneSize: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
  },
  dlButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.tint,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 4,
    shadowColor: C.tint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  dlButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  dlButtonText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  newBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  newBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: C.error,
    lineHeight: 20,
  },
});
