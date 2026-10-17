import { View, ScrollView, StyleSheet } from 'react-native';

export const A = () => (
  <ScrollView contentContainerStyle={styles.contentContainer}>
    <View style={styles.container} />
    <View style={styles.container2} />
  </ScrollView>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: {
    padding: 8,
  },
  container2: {
    margin: 4,
  },
});
