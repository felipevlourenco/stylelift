import { View, StyleSheet } from 'react-native';

export const A = () => <View style={[styles.a, { <|b>margin: 4 }]} />;

const styles = StyleSheet.create({
  a: { flex: 1 },
});
