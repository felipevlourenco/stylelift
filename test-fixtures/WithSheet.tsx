import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

export function WithSheet({ size }: { size: number }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {/* identical to styles.card: extract reuses it */}
      <View style={{ borderRadius: 8, padding: 12 }} />
      {/* merge into an existing key via "Merge into existing style…" */}
      <Text style={{ color: 'blue', fontWeight: 'bold' }}>merge me into title</Text>
      {/* cursor on styles.card: "Inline style" */}
      <View style={styles.card} />
      <View style={[styles.title, { width: size }]} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderRadius: 8,
  },
  title: {
    color: 'red',
    fontSize: 20,
  },
});
