import { View, StyleSheet } from 'react-native';

export const Box = ({ size }: { size: number }) => (
  <View style={[styles.a, { width: size, <|b>padding: 8, height: size }]} />
);

const styles = StyleSheet.create({
  a: { flex: 1 },
});
