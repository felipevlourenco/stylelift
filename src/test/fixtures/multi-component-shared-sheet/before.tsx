import { View, StyleSheet } from 'react-native';

export const A = () => <View style={styles.container} />;

export const B = () => <View style={{ <|>margin: 4 }} />;

const styles = StyleSheet.create({
  container: { flex: 1 },
});
