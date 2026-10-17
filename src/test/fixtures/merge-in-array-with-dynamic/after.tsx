import { View, StyleSheet } from 'react-native';

export const A = ({ size }) => <View style={[styles.a, styles.box, { width: size }]} />;

const styles = StyleSheet.create({
  a: { flex: 1 },
  box: {
    margin: 4,
    padding: 2
  }
});
