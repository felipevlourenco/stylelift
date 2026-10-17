import React from 'react';
import { View, Text } from 'react-native';

export function App({ size }: { size: number }) {
  return (
    <View style={{ flex: 1, padding: 8 }}>
      <Text style={{ fontSize: 20, color: 'red' }}>Static: extract all of it</Text>
      <View style={{ width: size, margin: 4 }} />
      <View style={[{ opacity: 0.5 }, { height: size }]} />
    </View>
  );
}
