import { View, StyleSheet } from 'react-native';

export const A = () => <View style={styles.label} />;

const styles = StyleSheet.create({
  title: { margin: 2 },
  card: { flex: 1 },
  label: {
    margin: 4,
  },
});
