import { ScrollView, StyleSheet } from 'react-native';

export const A = () => <ScrollView contentContainerStyle={styles.contentContainer} />;

const styles = StyleSheet.create({
  contentContainer: {
    padding: 8,
  },
});
