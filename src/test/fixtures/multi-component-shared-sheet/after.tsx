import { View, StyleSheet } from 'react-native';

export const A = () => <View style={styles.container} />;

export const B = () => <View style={styles.container2} />;

const styles = StyleSheet.create({
  container: { flex: 1 },
  container2: {
    margin: 4,
  },
});
