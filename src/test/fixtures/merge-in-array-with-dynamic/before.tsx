import { View, StyleSheet } from 'react-native';

export const A = ({ size }) => <View style={[styles.a, { width: size, <|box>padding: 2 }]} />;

const styles = StyleSheet.create({
  a: { flex: 1 },
  box: {
    margin: 4
  }
});
