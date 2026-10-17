import { View, StyleSheet } from 'react-native';

export const Card = () => <View style={styles.label} />;

const styles = StyleSheet.create({
  container: { flex: 1 },
  label: {
    color: 'red',
  },
});
