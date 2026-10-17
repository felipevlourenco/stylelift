import { View, StyleSheet } from 'react-native';

export const Box = ({ size }: { size: number }) => (
  <View style={[styles.a, styles.b, { width: size, height: size }]} />
);

const styles = StyleSheet.create({
  a: { flex: 1 },
  b: {
    padding: 8,
  },
});
