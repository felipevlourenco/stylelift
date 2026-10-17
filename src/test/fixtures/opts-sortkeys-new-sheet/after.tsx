import { View, StyleSheet } from 'react-native';

export const A = () => <View style={styles.container} />;

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'red',
    flex: 1,
    padding: 8,
  },
});
