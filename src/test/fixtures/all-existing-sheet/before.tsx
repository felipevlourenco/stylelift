import { View, ScrollView, StyleSheet } from 'react-native';

export const A = () => (
  <ScrollView contentContainerStyle={{ padding: 8 }}>
    <View style={{ flex: 1 }} />
    <View style={{ margin: 4 }} />
  </ScrollView>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
});
