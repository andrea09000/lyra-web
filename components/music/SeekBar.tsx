import { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
  onScrub?: (seconds: number | null) => void;
};

export function SeekBar({ position, duration, onSeek, onScrub }: Props) {
  const { colors } = useTheme();
  const widthRef = useRef(1);
  const pageXRef = useRef(0);
  const durationRef = useRef(duration);
  const onSeekRef = useRef(onSeek);
  const onScrubRef = useRef(onScrub);
  const barRef = useRef<View>(null);
  const [dragging, setDragging] = useState(false);
  const [dragRatio, setDragRatio] = useState(0);

  durationRef.current = duration;
  onSeekRef.current = onSeek;
  onScrubRef.current = onScrub;

  const enabled = duration > 0;
  const ratio = useMemo(() => {
    if (dragging) return dragRatio;
    if (duration <= 0) return 0;
    return Math.max(0, Math.min(1, position / duration));
  }, [dragging, dragRatio, position, duration]);

  const ratioFromX = (x: number) => {
    const w = widthRef.current || 1;
    return Math.max(0, Math.min(1, x / w));
  };

  const ratioFromPageX = (pageX: number) => ratioFromX(pageX - pageXRef.current);

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = Math.max(e.nativeEvent.layout.width, 1);
    barRef.current?.measureInWindow((x, _y, w) => {
      pageXRef.current = x;
      widthRef.current = Math.max(w, 1);
    });
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => durationRef.current > 0,
      onMoveShouldSetPanResponder: () => durationRef.current > 0,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        barRef.current?.measureInWindow((x, _y, w) => {
          pageXRef.current = x;
          widthRef.current = Math.max(w, 1);
        });
        const r = ratioFromX(evt.nativeEvent.locationX);
        setDragging(true);
        setDragRatio(r);
        onScrubRef.current?.(r * durationRef.current);
      },
      onPanResponderMove: (evt) => {
        const r = ratioFromPageX(evt.nativeEvent.pageX);
        setDragRatio(r);
        onScrubRef.current?.(r * durationRef.current);
      },
      onPanResponderRelease: (evt) => {
        const r = ratioFromPageX(evt.nativeEvent.pageX);
        setDragRatio(r);
        setDragging(false);
        onScrubRef.current?.(null);
        if (durationRef.current > 0) onSeekRef.current(r * durationRef.current);
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        onScrubRef.current?.(null);
      },
    })
  ).current;

  return (
    <View
      ref={barRef}
      onLayout={onLayout}
      style={[styles.hit, !enabled && styles.disabled]}
      {...(enabled ? pan.panHandlers : {})}
    >
      <View style={[styles.track, { backgroundColor: colors.fog }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${ratio * 100}%`,
              backgroundColor: colors.green,
            },
          ]}
        />
        <View
          style={[
            styles.thumb,
            {
              left: `${ratio * 100}%`,
              backgroundColor: colors.green,
              opacity: enabled ? 1 : 0.4,
              transform: [{ scale: dragging ? 1.2 : 1 }],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    height: 36,
    justifyContent: 'center',
    marginVertical: -8,
  },
  disabled: { opacity: 0.7 },
  track: {
    height: 5,
    width: '100%',
    borderRadius: 3,
    overflow: 'visible',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    top: -6,
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
  },
});
