import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Colors from "@/constants/colors";

const C = Colors.light;

interface Props {
  progress: number;
  height?: number;
  color?: string;
}

export function ProgressBar({ progress, height = 4, color = C.tint }: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.min(progress / 100, 1),
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const widthInterp = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={[styles.track, { height }]}>
      <Animated.View
        style={[
          styles.fill,
          {
            height,
            width: widthInterp,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 100,
    overflow: "hidden",
  },
  fill: {
    borderRadius: 100,
  },
});
