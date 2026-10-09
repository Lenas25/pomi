import { useEffect, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'phosphor-react-native';

import { bezierFromToken } from './easing';
import { useTheme } from './theme';
import { hiddenScrollIndicators } from './scroll';

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Spoken name of the close button (also closed by the scrim and Android back). */
  closeLabel: string;
  children: ReactNode;
};

/**
 * Modal bottom sheet: scrim + raised surface with a title row and a 48 dp close button.
 * Slides up in 240 ms `easing.out`; with reduce-motion it only fades (120 ms). Safe-area aware
 * (bottom inset) and keyboard aware (`KeyboardAvoidingView`, taps reach buttons while it is up).
 */
export function BottomSheet({ visible, onClose, title, closeLabel, children }: BottomSheetProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const entered = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      entered.value = 0;
      return;
    }
    entered.value = withTiming(1, {
      duration: reduceMotion ? theme.motion.reducedFade : theme.motion.base,
      easing: bezierFromToken(theme.motion.easing.out),
    });
  }, [visible, entered, reduceMotion, theme.motion]);

  const animated = useAnimatedStyle(() => ({
    opacity: entered.value,
    transform: [{ translateY: reduceMotion ? 0 : (1 - entered.value) * theme.ring.size }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* The keyboard pushes the sheet up so a text field and its Save button stay visible. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme.color.scrim,
          }}
        />
        <Animated.View
          accessibilityViewIsModal
          style={[
            {
              alignSelf: 'center',
              width: '100%',
              maxWidth: theme.layout.maxContentWidth,
              maxHeight: '85%',
              backgroundColor: theme.color.surfaceRaised,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              paddingTop: theme.space[3],
              paddingHorizontal: theme.space[5],
              gap: theme.space[3],
            },
            animated,
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
            <Text
              accessibilityRole="header"
              style={[theme.text('title-sm'), { color: theme.color.text, flex: 1 }]}
            >
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              onPress={onClose}
              style={{
                width: theme.touch.gym,
                height: theme.touch.gym,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X color={theme.color.text} />
            </Pressable>
          </View>
          <ScrollView
            {...hiddenScrollIndicators}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: theme.space[3] }}
          >
            {children}
          </ScrollView>
          {/* Keeps the last row above the gesture bar (edge-to-edge). */}
          <SafeAreaView edges={['bottom']} style={{ paddingBottom: theme.space[2] }} />
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
