import { View, StyleSheet } from 'react-native';

export const A = ({ size }) => <View style={[styles.a, { <|>flex: 1, width: size }]} />;

const styles = StyleSheet.create({
  a: { margin: 1 },
  box: { flex: 1 },
});
