import { View, StyleSheet } from 'react-native';

export const A = () => <View style={styles.box} />;

const styles = StyleSheet.create({
  container: { flex: 1 }, // keep this one first
  box: {
    margin: 4
  }
});
