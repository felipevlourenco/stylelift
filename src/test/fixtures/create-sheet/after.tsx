import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function Card({ title }: { title: string }) {
  return (
    <View style={styles.container}>
      <Text>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 8,
  },
});
