import { View, StyleSheet } from 'react-native';

export const A = () => <View style={styles.label} />;

const styles = StyleSheet.create({
  card: { flex: 1 },
  label: {
    color: 'red',
    fontSize: 12,
  },
  title: { margin: 2 },
});
