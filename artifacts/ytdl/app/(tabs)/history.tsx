import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import React from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { HistoryEntry, useDownload } from "@/context/DownloadContext";

const C = Colors.light;

function formatDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number) {
  if (!bytes) return "";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

function HistoryItem({
  item,
  onDelete,
}: {
  item: HistoryEntry;
  onDelete: () => void;
}) {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const fileUrl = domain
    ? `https://${domain}/api/download/file/${item.jobId}`
    : `/api/download/file/${item.jobId}`;

  const handleDownload = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(fileUrl);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("삭제", "이 항목을 기록에서 삭제할까요?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: onDelete },
    ]);
  };

  return (
    <View style={styles.item}>
      <View
        style={[
          styles.iconBox,
          { backgroundColor: item.mode === "audio" ? "rgba(255,59,48,0.15)" : "rgba(255,107,53,0.15)" },
        ]}
      >
        <Feather
          name={item.mode === "audio" ? "music" : "video"}
          size={16}
          color={item.mode === "audio" ? C.tint : C.accent}
        />
      </View>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle} numberOfLines={2}>{item.title || item.filename}</Text>
        <Text style={styles.itemMeta}>
          {item.mode === "audio" ? "MP3" : "MP4"} • {formatBytes(item.filesize)} • {formatDate(item.completedAt)}
        </Text>
      </View>
      <View style={styles.itemActions}>
        <Pressable
          onPress={handleDownload}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
        >
          <Feather name="download" size={18} color={C.tint} />
        </Pressable>
        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
        >
          <Feather name="trash-2" size={16} color="rgba(255,255,255,0.3)" />
        </Pressable>
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { history, deleteHistoryEntry, clearHistory } = useDownload();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleClearAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("전체 삭제", "다운로드 기록을 모두 삭제할까요?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: clearHistory },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>다운로드 기록</Text>
        {history.length > 0 && (
          <Pressable
            onPress={handleClearAll}
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.clearBtnText}>전체 삭제</Text>
          </Pressable>
        )}
      </View>

      {history.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Feather name="clock" size={32} color="rgba(255,255,255,0.15)" />
          </View>
          <Text style={styles.emptyTitle}>기록 없음</Text>
          <Text style={styles.emptyText}>완료된 다운로드가 여기에 표시됩니다</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.jobId}
          renderItem={({ item }) => (
            <HistoryItem
              item={item}
              onDelete={() => deleteHistoryEntry(item.jobId)}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: botPad + 100 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    marginTop: 8,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: C.text,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,59,48,0.1)",
  },
  clearBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: C.tint,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 80,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: "rgba(255,255,255,0.4)",
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.25)",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 14,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  itemContent: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: C.text,
    lineHeight: 18,
  },
  itemMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: C.textSecondary,
  },
  itemActions: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    marginTop: 2,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: C.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  separator: {
    height: 1,
    backgroundColor: C.border,
  },
});
