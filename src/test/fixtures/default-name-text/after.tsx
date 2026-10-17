import { Text, StyleSheet } from 'react-native';

export const A = () => <Text style={styles.text}>x</Text>;

const styles = StyleSheet.create({
  container: { flex: 1 },
  text: {
    fontSize: 9,
  },
});
